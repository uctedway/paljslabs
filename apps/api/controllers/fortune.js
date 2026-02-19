const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../../core/utils/db');
const { guardSajuService } = require('../services/saju_guard');
const { consumeToken, refundToken } = require('../services/token_wallet');
const { TOKENS_PER_SAJU_REQUEST } = require('../services/token_constants');
const { toErrorDisplay } = require('../utils/analysis_error');
const {
  createSajuResultRecord,
  getSajuResultRecord,
  updateSajuResultRecord,
} = require('../services/saju_result_store');
const {
  tryAcquireUserAnalysisSlot,
  keepAliveUserAnalysisSlot,
  releaseUserAnalysisSlot,
} = require('../services/analysis_job_manager');

const FEATURE_MAP = {
  compatibility: { label: '궁합', usageCode: 'COMPATIBILITY_VIEW', promptFile: 'compatibility.txt' },
  today: { label: '오늘의 운세', usageCode: 'TODAY_FORTUNE_VIEW', promptFile: 'today.txt' },
  flow: { label: '대운·세운', usageCode: 'FLOW_FORTUNE_VIEW', promptFile: 'flow.txt' },
  naming: { label: '작명/개명 보조', usageCode: 'NAMING_VIEW', promptFile: 'naming.txt' },
  'date-selection': { label: '택일', usageCode: 'DATE_SELECTION_VIEW', promptFile: 'date_selection.txt' },
};

const PROMPT_BASE_FILE = path.join(__dirname, '../prompts/fortune/base.txt');
const PROMPT_TYPE_DIR = path.join(__dirname, '../prompts/fortune');

let promptCache = null;

function isTruthyEnv(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'y' || normalized === 'yes' || normalized === 'on';
}

function normalizeFeature(rawFeature) {
  const key = String(rawFeature || '').trim().toLowerCase();
  return FEATURE_MAP[key] ? key : '';
}

function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function buildTokenReferenceId(featureKey) {
  return `FORTUNE-${featureKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapGenderToApiDb(rawGender) {
  const value = String(rawGender || '').trim().toLowerCase();
  if (value === 'm' || value === 'male' || value === 'man' || value === '남' || value === '남성') {
    return { apiGender: 'male', dbGender: 'M' };
  }
  if (value === 'f' || value === 'female' || value === 'woman' || value === '여' || value === '여성') {
    return { apiGender: 'female', dbGender: 'F' };
  }
  return null;
}

function normalizeBirthDateParts(yearRaw, monthRaw, dayRaw) {
  const y = String(yearRaw || '').trim();
  const m = String(monthRaw || '').trim();
  const d = String(dayRaw || '').trim();
  if (!y || !m || !d) return '';
  return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function normalizeBirthTimeForDb(rawBirthTime) {
  const value = String(rawBirthTime || '').trim();
  if (!value || value === '99:99:99') {
    return { timeSql: 'NULL', timeForSession: '99:99:99', isUnknown: 1 };
  }

  const withSeconds = value.length === 5 ? `${value}:00` : value;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(withSeconds)) return null;
  return { timeSql: `'${withSeconds}'`, timeForSession: withSeconds, isUnknown: 0 };
}

function normalizeDateForCompare(rawDate) {
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return rawDate.toISOString().slice(0, 10);
  }
  const v = String(rawDate || '').trim();
  if (!v) return '';
  if (v.includes('T')) return v.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return '';
}

function normalizeTimeForCompare(rawTime, birthTimeUnknown = 0) {
  if (Number(birthTimeUnknown || 0) === 1) return '99:99:99';
  if (rawTime instanceof Date && !Number.isNaN(rawTime.getTime())) {
    return rawTime.toISOString().slice(11, 19);
  }
  const v = String(rawTime || '').trim();
  if (!v) return '';
  if (v.includes('T')) {
    const t = v.split('T')[1] || '';
    if (t.length >= 8) return t.slice(0, 8);
  }
  if (v.includes('.')) return v.split('.')[0].slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
  return v.slice(0, 8);
}

function parseTargetSelection(rawTarget, rawRelativeId) {
  const target = String(rawTarget || '').trim();
  const explicitRelativeId = toPositiveInt(rawRelativeId);
  if (target.startsWith('self:')) {
    return { targetType: 'self', relativeId: 0 };
  }
  if (target.startsWith('relative:')) {
    const idFromTarget = toPositiveInt(target.split(':')[1]);
    return { targetType: 'relative', relativeId: idFromTarget || explicitRelativeId };
  }
  if (explicitRelativeId > 0) {
    return { targetType: 'relative', relativeId: explicitRelativeId };
  }
  return { targetType: 'new', relativeId: 0 };
}

function loadPromptCache() {
  if (promptCache) return promptCache;

  const basePrompt = fs.readFileSync(PROMPT_BASE_FILE, 'utf8');
  const typePrompts = {};
  Object.entries(FEATURE_MAP).forEach(([key, meta]) => {
    typePrompts[key] = fs.readFileSync(path.join(PROMPT_TYPE_DIR, meta.promptFile), 'utf8');
  });

  promptCache = { basePrompt, typePrompts };
  return promptCache;
}

function buildClaudePrompt(featureKey, payload) {
  const { basePrompt, typePrompts } = loadPromptCache();
  const typePrompt = typePrompts[featureKey] || '';

  return `${basePrompt}

# 분석 타입
${typePrompt}

# 사용자 입력
\`\`\`json
${JSON.stringify(payload || {}, null, 2)}
\`\`\`

# 출력 규칙
- 서비스 정책에 맞게 실사용 가능한 한국어 결과를 작성한다.
- 과장/단정 표현을 피하고 실행 가능한 조언을 포함한다.`;
}

async function requestClaudeFortuneResult({ featureKey, payload, featureRaw }) {
  const shortMode = isTruthyEnv(process.env.SAJU_CLAUDE_SANDBOX) || isTruthyEnv(process.env.CLAUDE_SHORT_TEST);
  const featureLabel = FEATURE_MAP[featureKey]?.label || '운세';

  const requestBody = shortMode
    ? {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 64,
      messages: [{ role: 'user', content: `${featureLabel} 결과를 한 문장으로만 알려줘.` }],
    }
    : {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: buildClaudePrompt(featureKey, payload),
      messages: [{
        role: 'user',
        content: `원국 데이터:\n${JSON.stringify(featureRaw || {}, null, 2)}\n\n입력:\n${JSON.stringify(payload || {}, null, 2)}`,
      }],
    };

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }
  );

  const text = String(response?.data?.content?.[0]?.text || '').trim();
  return text || `${featureLabel} 결과`;
}

function normalizeSinglePayload(featureKey, body = {}) {
  const selected = parseTargetSelection(body.singleTarget, body.singleRelativeId);
  const normalized = {
    featureKey,
    name: String(body.singleName || body.name || '').trim(),
    gender: String(body.singleGender || body.gender || '').trim(),
    birthYear: String(body.singleBirthYear || body.birthYear || '').trim(),
    birthMonth: String(body.singleBirthMonth || body.birthMonth || '').trim(),
    birthDay: String(body.singleBirthDay || body.birthDay || '').trim(),
    birthTime: String(body.singleBirthTime || body.birthTime || '').trim(),
    target: String(body.singleTarget || body.target || ''),
    relative_id: selected.relativeId,
    targetType: selected.targetType,
  };

  normalized.birthData = `${normalized.birthYear}-${normalized.birthMonth}-${normalized.birthDay} ${normalized.birthTime}`;

  if (featureKey === 'today') normalized.focusArea = String(body.focusArea || '').trim();
  if (featureKey === 'flow') normalized.targetPeriod = String(body.targetPeriod || '').trim();
  if (featureKey === 'naming') normalized.candidateName = String(body.candidateName || '').trim();
  if (featureKey === 'date-selection') {
    normalized.eventType = String(body.eventType || '').trim();
    normalized.candidateDate = String(body.candidateDate || '').trim();
  }

  return normalized;
}

function normalizeCompatibilityPayload(body = {}) {
  const p1Selection = parseTargetSelection(body.person1Target, body.person1RelativeId);
  const p2Selection = parseTargetSelection(body.person2Target, body.person2RelativeId);

  return {
    featureKey: 'compatibility',
    relationship: String(body.relationship || '').trim(),
    person1Target: String(body.person1Target || '').trim(),
    person1RelativeId: p1Selection.relativeId,
    person1TargetType: p1Selection.targetType,
    person1Name: String(body.person1Name || '').trim(),
    person1BirthYear: String(body.person1BirthYear || '').trim(),
    person1BirthMonth: String(body.person1BirthMonth || '').trim(),
    person1BirthDay: String(body.person1BirthDay || '').trim(),
    person1BirthTime: String(body.person1BirthTime || '').trim(),
    person1Gender: String(body.person1Gender || '').trim(),
    person2Target: String(body.person2Target || '').trim(),
    person2RelativeId: p2Selection.relativeId,
    person2TargetType: p2Selection.targetType,
    person2Name: String(body.person2Name || '').trim(),
    person2BirthYear: String(body.person2BirthYear || '').trim(),
    person2BirthMonth: String(body.person2BirthMonth || '').trim(),
    person2BirthDay: String(body.person2BirthDay || '').trim(),
    person2BirthTime: String(body.person2BirthTime || '').trim(),
    person2Gender: String(body.person2Gender || '').trim(),
  };
}

function normalizePayloadByFeature(featureKey, body = {}) {
  if (featureKey === 'compatibility') {
    return normalizeCompatibilityPayload(body);
  }
  return normalizeSinglePayload(featureKey, body);
}

function validatePayload(featureKey, payload) {
  const requiredByFeature = {
    compatibility: [
      'relationship',
      'person1Name',
      'person1BirthYear',
      'person1BirthMonth',
      'person1BirthDay',
      'person1BirthTime',
      'person1Gender',
      'person2Name',
      'person2BirthYear',
      'person2BirthMonth',
      'person2BirthDay',
      'person2BirthTime',
      'person2Gender',
    ],
    today: ['name', 'gender', 'birthYear', 'birthMonth', 'birthDay', 'birthTime', 'focusArea'],
    flow: ['name', 'gender', 'birthYear', 'birthMonth', 'birthDay', 'birthTime', 'targetPeriod'],
    naming: ['name', 'gender', 'birthYear', 'birthMonth', 'birthDay', 'birthTime', 'candidateName'],
    'date-selection': ['name', 'gender', 'birthYear', 'birthMonth', 'birthDay', 'birthTime', 'eventType', 'candidateDate'],
  };

  const required = requiredByFeature[featureKey] || [];
  const missing = required.filter((k) => !String(payload?.[k] || '').trim());
  return { ok: missing.length === 0, missing };
}

async function loadSavedSajuRawData(loginId, relativeId) {
  const relativeIdNum = toPositiveInt(relativeId);
  const procLoginId = relativeIdNum > 0 ? '' : String(loginId || '');
  const procRelativeId = relativeIdNum > 0 ? relativeIdNum : 0;
  if (!procLoginId && procRelativeId <= 0) return null;

  const qLoginId = db.convertQ(procLoginId);
  const query = `
    EXEC dbo.PJ_USP_SELECT_SAJU_RAW_DATA
      @login_id    = '${qLoginId}',
      @relative_id = ${procRelativeId}
  `;

  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : {};
  const resp = String(row.resp || 'ERROR').toUpperCase();
  if (resp !== 'OK') return null;

  const raw = row.saju_raw_data || '';
  if (!raw) return null;
  return JSON.parse(raw);
}

async function saveSajuRawData(loginId, relativeId, sajuRawData) {
  const relativeIdNum = toPositiveInt(relativeId);
  if (!loginId && relativeIdNum <= 0) return null;

  const procLoginId = relativeIdNum > 0 ? '' : String(loginId || '');
  const procRelativeId = relativeIdNum > 0 ? relativeIdNum : 0;
  const qLoginId = db.convertQ(procLoginId);
  const qRaw = db.convertQ(JSON.stringify(sajuRawData || {}));

  const query = `
    EXEC dbo.PJ_USP_SAVE_SAJU_RAW_DATA
      @login_id      = '${qLoginId}',
      @relative_id   = ${procRelativeId},
      @saju_raw_data = N'${qRaw}'
  `;

  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

function buildRequestedTargetSnapshot(person) {
  const birthDate = normalizeBirthDateParts(person?.birthYear, person?.birthMonth, person?.birthDay);
  const birthTimeInfo = normalizeBirthTimeForDb(person?.birthTime);
  const genderInfo = mapGenderToApiDb(person?.gender);
  if (!birthDate || !birthTimeInfo || !genderInfo) return null;

  return {
    birthDate,
    birthTime: birthTimeInfo.timeForSession,
    birthTimeUnknown: birthTimeInfo.isUnknown,
    birthTimeSql: birthTimeInfo.timeSql,
    genderDb: genderInfo.dbGender,
  };
}

function isTargetBirthChanged(currentSnapshot, requestedSnapshot) {
  if (!currentSnapshot || !requestedSnapshot) return false;

  const currentBirthDate = normalizeDateForCompare(currentSnapshot.birthDate);
  const currentBirthTime = normalizeTimeForCompare(currentSnapshot.birthTime, currentSnapshot.birthTimeUnknown);
  const currentGenderDb = String(currentSnapshot.genderDb || '').trim().toUpperCase();

  return (
    currentBirthDate !== String(requestedSnapshot.birthDate || '') ||
    currentBirthTime !== String(requestedSnapshot.birthTime || '') ||
    currentGenderDb !== String(requestedSnapshot.genderDb || '').trim().toUpperCase()
  );
}

async function loadSelectedTargetSnapshot(loginId, targetType, relativeId) {
  const qLoginId = db.convertQ(String(loginId || ''));
  if (!qLoginId) return null;

  if (targetType === 'self') {
    const query = `
      SELECT TOP 1
        user_gender AS gender_db,
        user_birth_date AS birth_date,
        user_birth_time AS birth_time,
        birth_time_unknown
      FROM dbo.PJ_TB_USERS WITH (NOLOCK)
      WHERE login_id = '${qLoginId}'
    `;
    const rs = await db.query(query);
    const row = rs && rs[0] ? rs[0] : null;
    if (!row) return null;
    return {
      genderDb: String(row.gender_db || '').trim().toUpperCase(),
      birthDate: row.birth_date,
      birthTime: row.birth_time,
      birthTimeUnknown: Number(row.birth_time_unknown || 0),
    };
  }

  if (targetType === 'relative') {
    const relativeIdNum = toPositiveInt(relativeId);
    if (relativeIdNum <= 0) return null;
    const query = `
      SELECT TOP 1
        relation,
        relative_name,
        relative_gender AS gender_db,
        relative_birth_date AS birth_date,
        relative_birth_time AS birth_time,
        birth_time_unknown
      FROM dbo.PJ_TB_RELATIVES WITH (NOLOCK)
      WHERE login_id = '${qLoginId}'
        AND relative_id = ${relativeIdNum}
    `;
    const rs = await db.query(query);
    const row = rs && rs[0] ? rs[0] : null;
    if (!row) return null;
    return {
      relation: String(row.relation || '').trim().toUpperCase(),
      relativeName: String(row.relative_name || '').trim(),
      genderDb: String(row.gender_db || '').trim().toUpperCase(),
      birthDate: row.birth_date,
      birthTime: row.birth_time,
      birthTimeUnknown: Number(row.birth_time_unknown || 0),
    };
  }

  return null;
}

async function syncSelectedTargetBirthInfo(loginId, targetType, relativeId, person, currentSnapshot) {
  const requested = buildRequestedTargetSnapshot(person);
  if (!requested) return { ok: false, message: 'REQUEST_BIRTH_INVALID' };

  const qLoginId = db.convertQ(String(loginId || ''));
  if (!qLoginId) return { ok: false, message: 'LOGIN_REQUIRED' };

  if (targetType === 'self') {
    const profileQuery = `
      EXEC dbo.PJ_USP_MODIFY_USER
        @login_id = '${qLoginId}',
        @user_gender = '${requested.genderDb}',
        @user_birth_date = '${requested.birthDate}',
        @user_birth_time = ${requested.birthTimeSql},
        @birth_time_unknown = ${requested.birthTimeUnknown}
    `;
    const rs = await db.query(profileQuery);
    const row = rs && rs[0] ? rs[0] : {};
    return {
      ok: String(row.resp || 'ERROR').toUpperCase() === 'OK',
      message: String(row.resp_message || ''),
    };
  }

  if (targetType === 'relative') {
    const relativeIdNum = toPositiveInt(relativeId);
    if (relativeIdNum <= 0) return { ok: false, message: 'RELATIVE_ID_REQUIRED' };

    const relation = String(currentSnapshot?.relation || 'OTHER').trim().toUpperCase() || 'OTHER';
    const relativeName = String(currentSnapshot?.relativeName || person?.name || '지인').trim();
    const qRelation = db.convertQ(relation);
    const qName = db.convertQ(relativeName);

    const relativeQuery = `
      EXEC dbo.PJ_USP_CREATE_RELATIVE
        @relative_id = ${relativeIdNum},
        @login_id = '${qLoginId}',
        @relation = '${qRelation}',
        @relative_name = N'${qName}',
        @relative_gender = '${requested.genderDb}',
        @relative_birth_date = '${requested.birthDate}',
        @relative_birth_time = ${requested.birthTimeSql},
        @birth_time_unknown = ${requested.birthTimeUnknown}
    `;
    const rs = await db.query(relativeQuery);
    const row = rs && rs[0] ? rs[0] : {};
    return {
      ok: String(row.resp || 'ERROR').toUpperCase() === 'OK',
      message: String(row.resp_message || ''),
    };
  }

  return { ok: false, message: 'TARGET_TYPE_NOT_SUPPORTED' };
}

async function fetchAblecitySajuData(person) {
  const genderInfo = mapGenderToApiDb(person?.gender);
  if (!genderInfo) {
    throw new Error('INVALID_GENDER');
  }
  const birthDate = normalizeBirthDateParts(person?.birthYear, person?.birthMonth, person?.birthDay);
  if (!birthDate || !String(person?.birthTime || '').trim()) {
    throw new Error('INVALID_BIRTH_INPUT');
  }
  const birth = `${birthDate}T${String(person.birthTime).trim()}`;

  const response = await axios.get('https://api.ablecity.kr/api/v1/saju/fortune', {
    params: { birth, gender: genderInfo.apiGender },
    headers: {
      Authorization: `Bearer ${process.env.ABLECITY_API_KEY}`,
      Accept: 'application/json',
    },
  });

  return {
    data: response.data,
    meta: {
      birth,
      gender: genderInfo.apiGender,
    },
  };
}

async function resolvePersonSajuData(loginId, person) {
  let source = 'ABLECITY';
  let data = null;
  let targetInfoChanged = false;

  const targetType = String(person?.targetType || 'new');
  const relativeId = toPositiveInt(person?.relativeId);
  const cacheLoginId = targetType === 'self' ? loginId : '';

  if (targetType === 'self' || targetType === 'relative') {
    try {
      const currentSnapshot = await loadSelectedTargetSnapshot(loginId, targetType, relativeId);
      const requestedSnapshot = buildRequestedTargetSnapshot(person);
      if (isTargetBirthChanged(currentSnapshot, requestedSnapshot)) {
        targetInfoChanged = true;
        await syncSelectedTargetBirthInfo(loginId, targetType, relativeId, person, currentSnapshot);
      }
    } catch (err) {
      console.error('[FORTUNE] 대상정보 비교/동기화 실패:', err.message);
    }
  }

  if (!targetInfoChanged && (targetType === 'self' || targetType === 'relative')) {
    try {
      data = await loadSavedSajuRawData(cacheLoginId, relativeId);
      if (data) source = 'CACHE';
    } catch (err) {
      console.error('[FORTUNE] cache lookup 실패:', err.message);
      data = null;
    }
  }

  if (!data) {
    const ablecity = await fetchAblecitySajuData(person);
    data = ablecity.data;
    source = 'ABLECITY';
    if (targetType === 'self' || targetType === 'relative') {
      try {
        await saveSajuRawData(cacheLoginId, relativeId, data);
      } catch (saveErr) {
        console.error('[FORTUNE] raw save 실패:', saveErr.message);
      }
    }
  }

  return { source, data, targetInfoChanged };
}

async function buildFeatureResult(featureKey, payload, loginId) {
  if (featureKey === 'compatibility') {
    const person1 = {
      name: payload.person1Name,
      birthYear: payload.person1BirthYear,
      birthMonth: payload.person1BirthMonth,
      birthDay: payload.person1BirthDay,
      birthTime: payload.person1BirthTime,
      gender: payload.person1Gender,
      targetType: payload.person1TargetType,
      relativeId: payload.person1RelativeId,
    };
    const person2 = {
      name: payload.person2Name,
      birthYear: payload.person2BirthYear,
      birthMonth: payload.person2BirthMonth,
      birthDay: payload.person2BirthDay,
      birthTime: payload.person2BirthTime,
      gender: payload.person2Gender,
      targetType: payload.person2TargetType,
      relativeId: payload.person2RelativeId,
    };

    const p1 = await resolvePersonSajuData(loginId, person1);
    const p2 = await resolvePersonSajuData(loginId, person2);

    const claudeText = await requestClaudeFortuneResult({
      featureKey,
      payload,
      featureRaw: { person1: p1.data, person2: p2.data },
    });
    return {
      resultText: claudeText,
      noticeMessage: (p1.targetInfoChanged || p2.targetInfoChanged) ? '지인정보가 변경되었습니다. 지인정보를 업데이트하고 진행합니다.' : '',
      ablecityMeta: {
        person1Source: p1.source,
        person2Source: p2.source,
        person1Changed: p1.targetInfoChanged,
        person2Changed: p2.targetInfoChanged,
      },
      raw: {
        person1: p1.data,
        person2: p2.data,
      },
    };
  }

  const single = {
    name: payload.name,
    birthYear: payload.birthYear,
    birthMonth: payload.birthMonth,
    birthDay: payload.birthDay,
    birthTime: payload.birthTime,
    gender: payload.gender,
    targetType: payload.targetType,
    relativeId: payload.relative_id,
  };

  const resolved = await resolvePersonSajuData(loginId, single);
  const claudeText = await requestClaudeFortuneResult({
    featureKey,
    payload,
    featureRaw: { person1: resolved.data },
  });
  return {
    resultText: claudeText,
    noticeMessage: resolved.targetInfoChanged
      ? (single.targetType === 'relative'
        ? '지인정보가 변경되었습니다. 지인정보를 업데이트하고 진행합니다.'
        : '내 정보가 변경되었습니다. 정보를 업데이트하고 진행합니다.')
      : '',
    ablecityMeta: {
      person1Source: resolved.source,
      person1Changed: resolved.targetInfoChanged,
    },
    raw: {
      person1: resolved.data,
    },
  };
}

async function processFortuneJob(resultId) {
  const record = await getSajuResultRecord(resultId);
  if (!record) return;

  const payload = record.request || {};
  const featureKey = normalizeFeature(payload.featureKey);
  const featureMeta = FEATURE_MAP[featureKey];
  const loginId = String(record.loginId || '').trim();
  const tokenUsageReferenceId = String(record.tokenUsageReferenceId || '').trim();

  if (!featureKey || !featureMeta) {
    await updateSajuResultRecord(resultId, {
      status: 'failed',
      step: 'FAILED',
      progressMessage: '운세 타입 확인에 실패했습니다.',
      errorMessage: 'FEATURE_NOT_FOUND',
    });
    await releaseUserAnalysisSlot({ loginId, resultId }).catch(() => {});
    return;
  }

  await keepAliveUserAnalysisSlot({ loginId, resultId });
  await updateSajuResultRecord(resultId, {
    status: 'processing',
    step: 'PROCESSING',
    progressMessage: 'AI가 운세 분석 리포트를 작성하고 있습니다.',
  });

  try {
    const featureResult = await buildFeatureResult(featureKey, payload, loginId);
    const claudePrompt = buildClaudePrompt(featureKey, payload);

    await updateSajuResultRecord(resultId, {
      status: 'completed',
      step: 'COMPLETED',
      progressMessage: '운세 분석이 완료되었습니다.',
      result: {
        claudeResult: featureResult.resultText,
        summary: `${featureMeta.label} 분석 완료`,
      },
      debug: {
        aiMode: 'live',
        promptPrepared: true,
        preparedPrompt: claudePrompt,
        ablecity: featureResult.ablecityMeta,
      },
      noticeMessage: String(featureResult.noticeMessage || ''),
    });
    await keepAliveUserAnalysisSlot({ loginId, resultId });
  } catch (featureErr) {
    await refundToken({
      loginId,
      amount: TOKENS_PER_SAJU_REQUEST,
      referenceType: 'FORTUNE_REQUEST',
      referenceId: tokenUsageReferenceId,
      memo: `${featureMeta.label} 실패 자동환불`,
    }).catch((refundErr) => {
      console.error('[FORTUNE] refund 실패:', refundErr.message);
    });

    await updateSajuResultRecord(resultId, {
      status: 'failed',
      step: 'FAILED',
      progressMessage: '운세 분석 중 오류가 발생했습니다.',
      errorMessage: String(featureErr?.message || featureErr),
    });
    await keepAliveUserAnalysisSlot({ loginId, resultId });
  } finally {
    await releaseUserAnalysisSlot({ loginId, resultId }).catch((releaseErr) => {
      console.error('[FORTUNE] slot release 실패:', releaseErr.message);
    });
  }
}

exports.createFortuneRequest = async (req, res) => {
  let acquiredResultId = '';
  let acquiredLoginId = '';
  try {
    const featureKey = normalizeFeature(req.params?.feature);
    if (!featureKey) {
      return res.status(404).json({
        resp: 'ERROR',
        resp_message: 'FEATURE_NOT_FOUND',
      });
    }

    const featureMeta = FEATURE_MAP[featureKey];
    const guard = await guardSajuService(req);
    if (!guard.ok) {
      return res.status(guard.httpStatus || 403).json({
        resp: 'ERROR',
        resp_message: guard.respMessage || 'GUARD_BLOCKED',
        message: guard.message || '요청 조건을 충족하지 못했습니다.',
        current_tokens: guard.current_tokens,
        required_tokens: guard.required_tokens,
      });
    }

    const payload = {
      featureKey,
      featureLabel: featureMeta.label,
      submittedAt: new Date().toISOString(),
      ...normalizePayloadByFeature(featureKey, req.body),
    };

    const validation = validatePayload(featureKey, payload);
    if (!validation.ok) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID_INPUT',
        message: `필수 입력값을 확인해주세요: ${validation.missing.join(', ')}`,
      });
    }

    const resultId = randomUUID();
    const slot = await tryAcquireUserAnalysisSlot({
      loginId: guard.loginId,
      resultId,
      serviceType: 'fortune',
    });
    if (!slot.ok) {
      return res.status(409).json({
        resp: 'ERROR',
        resp_message: 'ANALYSIS_ALREADY_RUNNING',
        message: '이미 분석이 진행 중입니다. 완료 후 다시 시도해주세요.',
        active_result_id: slot.existingResultId || '',
      });
    }
    acquiredResultId = resultId;
    acquiredLoginId = guard.loginId;

    const tokenUsageReferenceId = buildTokenReferenceId(featureKey);
    const consumeRow = await consumeToken({
      loginId: guard.loginId,
      amount: TOKENS_PER_SAJU_REQUEST,
      usageCode: featureMeta.usageCode,
      referenceType: 'FORTUNE_REQUEST',
      referenceId: tokenUsageReferenceId,
      memo: `${featureMeta.label} 요청`,
    });

    if (String(consumeRow?.resp || 'ERROR').toUpperCase() !== 'OK') {
      await releaseUserAnalysisSlot({ loginId: guard.loginId, resultId }).catch(() => {});
      return res.status(402).json({
        resp: 'ERROR',
        resp_message: consumeRow?.resp_message || 'TOKEN_CONSUME_FAILED',
        message: '토큰 차감에 실패했습니다.',
        current_tokens: Number(consumeRow?.current_tokens || 0),
        required_tokens: TOKENS_PER_SAJU_REQUEST,
      });
    }

    let record;
    try {
      record = await createSajuResultRecord({
        resultId,
        loginId: guard.loginId,
        request: payload,
        tokenUsageReferenceId,
        serviceType: 'fortune',
      });
    } catch (createErr) {
      await refundToken({
        loginId: guard.loginId,
        amount: TOKENS_PER_SAJU_REQUEST,
        referenceType: 'FORTUNE_REQUEST',
        referenceId: tokenUsageReferenceId,
        memo: `${featureMeta.label} 요청 생성 실패 자동환불`,
      }).catch(() => {});
      await releaseUserAnalysisSlot({ loginId: guard.loginId, resultId }).catch(() => {});
      throw createErr;
    }

    setImmediate(() => {
      processFortuneJob(record.resultId).catch((err) => {
        console.error('[FORTUNE JOB] unhandled error:', err);
      });
    });

    return res.json({
      resp: 'OK',
      resp_message: 'REQUEST_ACCEPTED',
      result_id: record.resultId,
      consumed_tokens: TOKENS_PER_SAJU_REQUEST,
      current_tokens: Number(consumeRow?.current_tokens || 0),
      status_url: `/api/fortune/${featureKey}/request/${record.resultId}/status`,
      result_url: `/fortune/result/${record.resultId}`,
    });
  } catch (err) {
    if (acquiredResultId && acquiredLoginId) {
      await releaseUserAnalysisSlot({ loginId: acquiredLoginId, resultId: acquiredResultId }).catch(() => {});
    }
    console.error('[FORTUNE REQUEST API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'FORTUNE_REQUEST_FAILED',
      message: '요청 처리 중 오류가 발생했습니다.',
    });
  }
};

exports.getFortuneStatus = async (req, res) => {
  try {
    const resultId = String(req.params?.resultId || '');
    const record = await getSajuResultRecord(resultId);
    if (!record) {
      return res.status(404).json({
        resp: 'ERROR',
        resp_message: 'RESULT_NOT_FOUND',
      });
    }

    const errorDisplay = toErrorDisplay(record.errorMessage);
    return res.json({
      resp: 'OK',
      result_id: resultId,
      status: record.status,
      step: record.step,
      progress_message: record.progressMessage || '',
      result_url: `/fortune/result/${resultId}`,
      error_message: record.errorMessage || '',
      error_message_display: String(errorDisplay.message || ''),
      error_hint: String(errorDisplay.hint || ''),
      error_code: String(errorDisplay.code || ''),
    });
  } catch (err) {
    console.error('[FORTUNE STATUS API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'STATUS_READ_FAILED',
    });
  }
};
