const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { beginApiRequest, finishApiRequest } = require('../utils/server');
const db = require('../../core/utils/db');
const { buildAppUrl } = require('../../core/utils/url');
const { normalizeRelationCode } = require('../../core/utils/relation_codes');
const { toErrorDisplay } = require('../utils/analysis_error');
const { guardSajuService } = require('../services/saju_guard');
const { consumeToken, refundToken } = require('../services/token_wallet');
const { TOKENS_PER_SAJU_REQUEST } = require('../services/token_constants');
const {
  tryAcquireUserAnalysisSlot,
  keepAliveUserAnalysisSlot,
  releaseUserAnalysisSlot,
} = require('../services/analysis_job_manager');
const {
  createSajuResultRecord,
  getSajuResultRecord,
  updateSajuResultRecord,
  getSajuResultRecordByLoginId,
  createOrGetShareTokenByLoginId,
} = require('../services/saju_result_store');

const COUNSELING_TYPE_MAP = {
  soft: { label: '부드러운 상담', file: 'soft.txt' },
  balanced: { label: '균형 상담', file: 'balanced.txt' },
  insight: { label: '통찰 강화', file: 'insight.txt' },
  direct: { label: '직설 상담', file: 'direct.txt' },
  factbomb: { label: '팩트폭격', file: 'factbomb.txt' },
};

const PROMPT_BASE_FILE = path.join(__dirname, '../prompts/saju/base.txt');
const PROMPT_TYPE_DIR = path.join(__dirname, '../prompts/saju/types');
let promptCache = null;

function isTruthyEnv(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'y' || normalized === 'yes' || normalized === 'on';
}

function normalizeCounselingType(value) {
  const key = String(value || '').trim().toLowerCase();
  return COUNSELING_TYPE_MAP[key] ? key : 'balanced';
}

function loadPromptCache() {
  if (promptCache) return promptCache;

  const basePrompt = fs.readFileSync(PROMPT_BASE_FILE, 'utf8');
  const typePrompts = {};

  Object.entries(COUNSELING_TYPE_MAP).forEach(([key, meta]) => {
    const filePath = path.join(PROMPT_TYPE_DIR, meta.file);
    typePrompts[key] = fs.readFileSync(filePath, 'utf8');
  });

  promptCache = { basePrompt, typePrompts };
  return promptCache;
}

function buildSystemPrompt(counselingType) {
  const { basePrompt, typePrompts } = loadPromptCache();
  const typePrompt = typePrompts[counselingType] || typePrompts.balanced || '';
  return `${basePrompt}

# 상담 유형 보정
${typePrompt}`;
}

function getSessionLoginId(req) {
  try {
    return String(req?.session?.user?.login_id || '');
  } catch (e) {
    return '';
  }
}

function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function mapGenderToDb(rawGender) {
  const value = String(rawGender || '').trim().toLowerCase();
  if (value === 'm' || value === 'male' || value === 'man' || value === '남' || value === '남성') return 'M';
  if (value === 'f' || value === 'female' || value === 'woman' || value === '여' || value === '여성') return 'F';
  return '';
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

function buildRequestedTargetSnapshot(payload) {
  const birthDate = normalizeBirthDateParts(payload?.birthYear, payload?.birthMonth, payload?.birthDay);
  const birthTimeInfo = normalizeBirthTimeForDb(payload?.birthTime);
  const genderDb = mapGenderToDb(payload?.gender);
  if (!birthDate || !birthTimeInfo || !genderDb) return null;

  return {
    birthDate,
    birthTime: birthTimeInfo.timeForSession,
    birthTimeUnknown: birthTimeInfo.isUnknown,
    birthTimeSql: birthTimeInfo.timeSql,
    genderDb,
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

async function syncSelectedTargetBirthInfo(loginId, targetType, relativeId, payload, currentSnapshot) {
  const requested = buildRequestedTargetSnapshot(payload);
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
    const relation = normalizeRelationCode(currentSnapshot?.relation || 'OTHER');
    const relativeName = String(currentSnapshot?.relativeName || payload?.name || '지인').trim();
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

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function buildTokenReferenceId() {
  return `SAJU-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeGender(rawGender) {
  const value = String(rawGender || '').trim().toLowerCase();

  if (value === 'm' || value === 'male' || value === 'man' || value === '남' || value === '남성') {
    return { apiGender: 'male', promptGender: '남성' };
  }

  if (value === 'f' || value === 'female' || value === 'woman' || value === '여' || value === '여성') {
    return { apiGender: 'female', promptGender: '여성' };
  }

  return null;
}

function normalizeTargetType(rawTarget, relativeIdNum) {
  const v = String(rawTarget || '').trim().toLowerCase();
  if (v === 'self') return 'self';
  if (relativeIdNum > 0) return 'relative';
  return 'new';
}

function calculateAge(birthYear, birthMonth, birthDay) {
  const today = new Date();
  const birth = new Date(birthYear, birthMonth - 1, birthDay);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getLifeStage(age) {
  if (age < 20) return '10대';
  if (age < 25) return '20대 초반';
  if (age < 28) return '20대 중반';
  if (age < 30) return '20대 후반';
  if (age < 35) return '30대 초반';
  if (age < 38) return '30대 중반';
  if (age < 40) return '30대 후반';
  if (age < 45) return '40대 초반';
  if (age < 48) return '40대 중반';
  if (age < 50) return '40대 후반';
  if (age < 55) return '50대 초반';
  if (age < 58) return '50대 중반';
  if (age < 60) return '50대 후반';
  return '60대 이상';
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

function buildUserPrompt(payload, sajuData, normalizedGender, counselingLabel, age, lifeStage) {
  return `# 고객 정보
- 이름: ${payload.name}
- 성별: ${normalizedGender.promptGender}
- 생년월일시: ${payload.birthYear}년 ${payload.birthMonth}월 ${payload.birthDay}일 ${payload.birthTime}시 (양력)
- 만 나이: ${age}세
- 생애주기: ${lifeStage}
- 상담 유형: ${counselingLabel}

# 사주 원국 데이터
\`\`\`json
${JSON.stringify(sajuData.data?.saju || sajuData, null, 2)}
\`\`\`

# 대운/세운 데이터
\`\`\`json
${JSON.stringify(sajuData.data?.daewoon || {}, null, 2)}
\`\`\`

# 요청
위 사주 데이터를 바탕으로 종합 상담 결과를 작성해줘.
반드시 고객의 나이(${age}세)와 현재 생애주기를 고려하여
모든 조언을 현실적이고 맥락에 맞게 작성할 것.

# 출력 형식(필수)
아래 JSON 객체 형식으로만 응답해.
\`\`\`json
{
  "summary": "핵심 요약 1~2문장 (plain text)",
  "body": "상세 본문 (markdown 형식)"
}
\`\`\`
- summary는 줄바꿈 최소화, 220자 이내 권장
- body는 마크다운으로 섹션/목록을 활용해 가독성 있게 작성`;
}

function extractJsonBlock(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return '';
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return String(fenced[1]).trim();
  if (text.startsWith('{') && text.endsWith('}')) return text;
  return '';
}

function parseClaudeStructuredResult(rawText, fallbackSummary = '') {
  const text = String(rawText || '').trim();
  const jsonText = extractJsonBlock(text);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const summary = String(parsed?.summary || '').trim();
      const body = String(parsed?.body || '').trim();
      if (body) {
        return {
          summary: (summary || fallbackSummary || '').trim(),
          body,
        };
      }
    } catch (_) {}
  }

  return {
    summary: String(fallbackSummary || '').trim(),
    body: text,
  };
}

async function processSajuJob(resultId) {
  const record = await getSajuResultRecord(resultId);
  if (!record) return;

  const payload = record.request || {};
  const loginId = String(record.loginId || '');
  const tokenUsageReferenceId = String(record.tokenUsageReferenceId || '').trim();
  const relativeIdNum = toPositiveInt(payload.relative_id);
  const targetType = normalizeTargetType(payload.targetType, relativeIdNum);
  const sajuLookupLoginId = targetType === 'self' ? loginId : '';
  const normalizedGender = normalizeGender(payload.gender);
  const normalizedCounselingType = normalizeCounselingType(payload.counselingType);
  const isClaudeSandboxMode = isTruthyEnv(process.env.SAJU_CLAUDE_SANDBOX);
  const counselingLabel = COUNSELING_TYPE_MAP[normalizedCounselingType].label;
  const birth = `${payload.birthYear}-${payload.birthMonth}-${payload.birthDay}T${payload.birthTime}`;
  const age = calculateAge(parseInt(payload.birthYear, 10), parseInt(payload.birthMonth, 10), parseInt(payload.birthDay, 10));
  const lifeStage = getLifeStage(age);
  const startedAt = Date.now();
  let ablecityReqId = 0;
  let claudeReqId = 0;
  console.log(`[SAJU JOB] 시작 resultId=${resultId} sandbox=${isClaudeSandboxMode}`);
  await keepAliveUserAnalysisSlot({ loginId, resultId });

  await updateSajuResultRecord(resultId, {
    status: 'processing',
    step: 'LOOKUP_CACHE',
    progressMessage: '저장된 사주 원본 데이터를 확인하고 있습니다.',
  });

  try {
    let sajuData = null;
    let sajuDataSource = 'ABLECITY';
    const logReq = loginId ? { session: { user: { login_id: loginId } } } : {};
    let targetInfoChanged = false;

    if (targetType === 'self' || targetType === 'relative') {
      try {
        const currentSnapshot = await loadSelectedTargetSnapshot(loginId, targetType, relativeIdNum);
        const requestedSnapshot = buildRequestedTargetSnapshot(payload);

        if (isTargetBirthChanged(currentSnapshot, requestedSnapshot)) {
          targetInfoChanged = true;
          await updateSajuResultRecord(resultId, {
            step: 'TARGET_SYNC',
            progressMessage: targetType === 'relative'
              ? '지인정보가 변경되었습니다. 지인정보를 업데이트하고 진행합니다.'
              : '내 정보가 변경되었습니다. 정보를 업데이트하고 진행합니다.',
          });

          const syncResult = await syncSelectedTargetBirthInfo(loginId, targetType, relativeIdNum, payload, currentSnapshot);
          if (!syncResult.ok) {
            console.error('[SAJU JOB] 대상 정보 업데이트 실패:', syncResult.message);
          }
        }
      } catch (targetSyncErr) {
        console.error('[SAJU JOB] 대상 정보 비교/동기화 실패:', targetSyncErr.message);
      }
    }

    if (!targetInfoChanged) {
      try {
        sajuData = await loadSavedSajuRawData(sajuLookupLoginId, relativeIdNum);
        if (sajuData) {
          sajuDataSource = 'CACHE';
          console.log('[SAJU JOB] 원국데이터베이스 조회완료');
          await updateSajuResultRecord(resultId, {
            step: 'CACHE_HIT',
            progressMessage: '저장된 사주 데이터를 찾았습니다. AI 해석을 준비합니다.',
          });
        }
      } catch (cacheErr) {
        console.error('[SAJU JOB] cache lookup 실패:', cacheErr.message);
      }
    } else {
      console.log('[SAJU JOB] 대상 정보 변경 감지: 캐시 조회 생략, 에이블시티 재호출');
    }

    if (!sajuData) {
      if (targetType === 'new') {
        console.log('[SAJU JOB] 새로보기: 원국데이터베이스 조회 생략');
      }

      await updateSajuResultRecord(resultId, {
        step: 'ABLECITY',
        progressMessage: '사주 원국 데이터를 계산하고 있습니다.',
      });

      const ablecityStartedAt = Date.now();
      try {
        const beginRow = await beginApiRequest(
          logReq,
          'ABLECITY',
          JSON.stringify({
            provider: 'ABLECITY',
            endpoint: '/api/v1/saju/fortune',
            input: {
              birth,
              gender: normalizedGender.apiGender,
              relative_id: relativeIdNum,
            },
          }),
          relativeIdNum
        );
        ablecityReqId = Number(beginRow?.req_id || 0);
      } catch (logErr) {
        console.error('[SAJU JOB] beginApiRequest(ABLECITY) 실패:', logErr.message);
      }

      try {
        const ablecityResponse = await axios.get('https://api.ablecity.kr/api/v1/saju/fortune', {
          params: { birth, gender: normalizedGender.apiGender },
          headers: {
            Authorization: `Bearer ${process.env.ABLECITY_API_KEY}`,
            Accept: 'application/json',
          },
        });
        sajuData = ablecityResponse.data;
        console.log(`[SAJU JOB] 에이블시티 호출완료 (${Date.now() - ablecityStartedAt}ms)`);

        try {
          await finishApiRequest(
            logReq,
            ablecityReqId,
            'SUCCESS',
            JSON.stringify({
              provider: 'ABLECITY',
              has_saju: !!(sajuData?.data?.saju),
              has_daewoon: !!(sajuData?.data?.daewoon),
            }),
            '',
            Date.now() - ablecityStartedAt
          );
        } catch (logErr) {
          console.error('[SAJU JOB] finishApiRequest(ABLECITY SUCCESS) 실패:', logErr.message);
        }
      } catch (ablecityErr) {
        try {
          await finishApiRequest(
            logReq,
            ablecityReqId,
            'FAILED',
            '',
            JSON.stringify(ablecityErr.response?.data || ablecityErr.message),
            Date.now() - ablecityStartedAt
          );
        } catch (logErr) {
          console.error('[SAJU JOB] finishApiRequest(ABLECITY FAILED) 실패:', logErr.message);
        }
        throw ablecityErr;
      }

      try {
        await saveSajuRawData(sajuLookupLoginId, relativeIdNum, sajuData);
      } catch (saveErr) {
        console.error('[SAJU JOB] raw save 실패:', saveErr.message);
      }
    }

    const claudeStartedAt = Date.now();
    try {
      const beginRow = await beginApiRequest(
        logReq,
        'CLAUDE',
        JSON.stringify({
          provider: sajuDataSource,
          input: {
            name: payload.name,
            birth,
            gender: normalizedGender.apiGender,
            counselingType: normalizedCounselingType,
            relative_id: relativeIdNum,
            sandbox_mode: isClaudeSandboxMode,
          },
          saju_meta: {
            has_saju: !!(sajuData?.data?.saju),
            has_daewoon: !!(sajuData?.data?.daewoon),
          },
        }),
        relativeIdNum
      );
      claudeReqId = Number(beginRow?.req_id || 0);
    } catch (logErr) {
      console.error('[SAJU JOB] beginApiRequest(CLAUDE) 실패:', logErr.message);
    }

    await updateSajuResultRecord(resultId, {
      step: 'CLAUDE',
      progressMessage: 'AI가 사주 해석 리포트를 작성하고 있습니다.',
    });

    const claudeRequestBody = isClaudeSandboxMode
      ? {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 64,
        messages: [{ role: 'user', content: '안녕하세요' }],
      }
      : {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: buildSystemPrompt(normalizedCounselingType),
        messages: [{
          role: 'user',
          content: buildUserPrompt(payload, sajuData, normalizedGender, counselingLabel, age, lifeStage),
        }],
      };

    const claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      claudeRequestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      }
    );
    console.log(`[SAJU JOB] 클로드 호출완료 (${Date.now() - claudeStartedAt}ms)`);

    const claudeRawResult = String(claudeResponse.data.content[0].text || '');
    const parsedResult = parseClaudeStructuredResult(
      claudeRawResult,
      `${payload.name || '고객'}님의 사주 핵심 흐름 요약`
    );
    const claudeResult = parsedResult.body;

    await updateSajuResultRecord(resultId, {
      status: 'completed',
      step: 'COMPLETED',
      progressMessage: '해석이 완료되었습니다. 결과 화면으로 이동합니다.',
      result: {
        summary: parsedResult.summary,
        claudeResult,
        name: payload.name,
        birthInfo: `${payload.birthYear}년 ${payload.birthMonth}월 ${payload.birthDay}일`,
      },
    });
    await keepAliveUserAnalysisSlot({ loginId, resultId });

    try {
      await finishApiRequest(
        logReq,
        claudeReqId,
        'SUCCESS',
        JSON.stringify({
          provider: 'CLAUDE',
          model: 'claude-sonnet-4-20250514',
          sandbox_mode: isClaudeSandboxMode,
          result_length: claudeResult.length,
        }),
        '',
        Date.now() - claudeStartedAt
      );
    } catch (logErr) {
      console.error('[SAJU JOB] finishApiRequest(CLAUDE SUCCESS) 실패:', logErr.message);
    }
  } catch (error) {
    console.error('[SAJU JOB] 실패:', error.response?.data || error.message);

    const logReq = loginId ? { session: { user: { login_id: loginId } } } : {};
    try {
      await finishApiRequest(
        logReq,
        claudeReqId,
        'FAILED',
        '',
        JSON.stringify(error.response?.data || error.message),
        Date.now() - startedAt
      );
    } catch (logErr) {
      console.error('[SAJU JOB] finishApiRequest(CLAUDE FAILED) 실패:', logErr.message);
    }

    let refundRespMessage = '';
    if (loginId && tokenUsageReferenceId) {
      try {
        const refundRow = await refundToken({
          loginId,
          amount: TOKENS_PER_SAJU_REQUEST,
          referenceType: 'SAJU_REQUEST',
          referenceId: tokenUsageReferenceId,
          memo: `${payload.name || '고객'} 사주 실패 자동환불`,
        });
        refundRespMessage = String(refundRow?.resp_message || '');
      } catch (refundErr) {
        refundRespMessage = refundErr.message;
        console.error('[SAJU JOB] token refund 실패:', refundErr.message);
      }
    }

    await updateSajuResultRecord(resultId, {
      status: 'failed',
      step: 'FAILED',
      progressMessage: '처리 중 오류가 발생했습니다.',
      errorMessage: JSON.stringify(error.response?.data || error.message),
      tokenRefund: {
        attempted: !!(loginId && tokenUsageReferenceId),
        referenceId: tokenUsageReferenceId,
        respMessage: refundRespMessage,
      },
    });
    await keepAliveUserAnalysisSlot({ loginId, resultId });
  } finally {
    await releaseUserAnalysisSlot({ loginId, resultId }).catch((releaseErr) => {
      console.error('[SAJU JOB] slot release 실패:', releaseErr.message);
    });
  }
}

exports.createSajuFortuneRequest = async (req, res) => {
  let acquiredResultId = '';
  let acquiredLoginId = '';
  try {
    const guard = await guardSajuService(req);
    if (!guard.ok) {
      return res.status(guard.httpStatus || 403).json({
        resp: 'ERROR',
        resp_message: guard.respMessage || 'SAJU_GUARD_BLOCKED',
        message: guard.message || '요청 조건을 충족하지 못했습니다.',
        current_tokens: guard.current_tokens,
        required_tokens: guard.required_tokens,
      });
    }

    const rawSajuTarget = String(req.body?.sajuTarget || '').trim();
    const relativeIdNum = toPositiveInt(req.body?.relative_id);

    const payload = {
      name: String(req.body?.name || '고객'),
      birthYear: String(req.body?.birthYear || ''),
      birthMonth: String(req.body?.birthMonth || ''),
      birthDay: String(req.body?.birthDay || ''),
      birthTime: String(req.body?.birthTime || ''),
      gender: String(req.body?.gender || ''),
      relative_id: relativeIdNum,
      targetType: normalizeTargetType(rawSajuTarget, relativeIdNum),
      counselingType: normalizeCounselingType(req.body?.counselingType),
    };

    const normalizedGender = normalizeGender(payload.gender);
    if (!normalizedGender) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID GENDER',
        message: '성별 값이 올바르지 않습니다.',
      });
    }

    if (!payload.birthYear || !payload.birthMonth || !payload.birthDay || !payload.birthTime) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID BIRTH INPUT',
        message: '생년월일시를 모두 입력해주세요.',
      });
    }

    const resultId = randomUUID();
    const slot = await tryAcquireUserAnalysisSlot({
      loginId: guard.loginId,
      resultId,
      serviceType: 'saju',
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

    const tokenUsageReferenceId = buildTokenReferenceId();
    const consumeRow = await consumeToken({
      loginId: guard.loginId,
      amount: TOKENS_PER_SAJU_REQUEST,
      usageCode: 'SAJU_VIEW',
      referenceType: 'SAJU_REQUEST',
      referenceId: tokenUsageReferenceId,
      memo: `${payload.name} 사주 요청`,
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
        serviceType: 'saju',
      });
    } catch (createErr) {
      await refundToken({
        loginId: guard.loginId,
        amount: TOKENS_PER_SAJU_REQUEST,
        referenceType: 'SAJU_REQUEST',
        referenceId: tokenUsageReferenceId,
        memo: `${payload.name} 사주 요청 생성 실패 자동환불`,
      }).catch(() => {});
      await releaseUserAnalysisSlot({ loginId: guard.loginId, resultId }).catch(() => {});
      throw createErr;
    }

    // 요청은 즉시 반환하고, 실제 긴 처리는 백그라운드로 넘깁니다.
    setImmediate(() => {
      processSajuJob(record.resultId).catch((err) => {
        console.error('[SAJU JOB] unhandled error:', err);
      });
    });

    return res.json({
      resp: 'OK',
      resp_message: 'REQUEST ACCEPTED',
      result_id: record.resultId,
      consumed_tokens: TOKENS_PER_SAJU_REQUEST,
      current_tokens: Number(consumeRow?.current_tokens || 0),
      status_url: `/api/saju/request/${record.resultId}/status`,
      result_url: `/user/mypage/history/${record.resultId}`,
    });
  } catch (err) {
    if (acquiredResultId && acquiredLoginId) {
      await releaseUserAnalysisSlot({ loginId: acquiredLoginId, resultId: acquiredResultId }).catch(() => {});
    }
    console.error('[SAJU REQUEST API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'REQUEST_CREATE_FAILED',
      message: '요청 생성 중 오류가 발생했습니다.',
    });
  }
};

exports.getSajuFortuneStatus = async (req, res) => {
  try {
    const resultId = String(req.params?.resultId || '');
    const record = await getSajuResultRecord(resultId);
    if (!record) {
      return res.status(404).json({
        resp: 'ERROR',
        resp_message: 'RESULT NOT FOUND',
      });
    }

    const errorDisplay = toErrorDisplay(record.errorMessage);
    return res.json({
      resp: 'OK',
      result_id: record.resultId,
      status: record.status,
      step: record.step,
      progress_message: record.progressMessage || '',
      result_url: `/user/mypage/history/${record.resultId}`,
      error_message: record.errorMessage || '',
      error_message_display: String(errorDisplay.message || ''),
      error_hint: String(errorDisplay.hint || ''),
      error_code: String(errorDisplay.code || ''),
      maintenance_mode: !!errorDisplay.maintenanceMode,
    });
  } catch (err) {
    console.error('[SAJU STATUS API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'STATUS_READ_FAILED',
    });
  }
};

exports.createSajuShareLink = async (req, res) => {
  try {
    const loginId = getSessionLoginId(req);
    if (!loginId) {
      return res.status(401).json({
        resp: 'ERROR',
        resp_message: 'LOGIN_REQUIRED',
      });
    }

    const resultId = String(req.params?.resultId || '');
    if (!resultId) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'RESULT_ID_REQUIRED',
      });
    }

    const ownedRecord = await getSajuResultRecordByLoginId(loginId, resultId);
    if (!ownedRecord) {
      return res.status(404).json({
        resp: 'ERROR',
        resp_message: 'RESULT_NOT_FOUND',
      });
    }

    if (String(ownedRecord.status || '') !== 'completed') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'RESULT_NOT_COMPLETED',
      });
    }

    const shareToken = await createOrGetShareTokenByLoginId(loginId, resultId);
    if (!shareToken) {
      return res.status(500).json({
        resp: 'ERROR',
        resp_message: 'SHARE_TOKEN_CREATE_FAILED',
      });
    }

    return res.json({
      resp: 'OK',
      result_id: resultId,
      share_token: shareToken,
      share_url: buildAppUrl(req, `/saju/shared/${encodeURIComponent(shareToken)}`),
    });
  } catch (err) {
    console.error('[SAJU SHARE API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'SHARE_LINK_CREATE_FAILED',
    });
  }
};

exports.saveTargetInfoFromRequest = async (req, res) => {
  try {
    const loginId = getSessionLoginId(req);
    if (!loginId) {
      return res.status(401).json({
        resp: 'ERROR',
        resp_message: 'LOGIN_REQUIRED',
      });
    }

    const saveAs = String(req.body?.save_as || '').trim().toLowerCase();
    if (saveAs !== 'profile' && saveAs !== 'relative') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID_SAVE_TARGET',
      });
    }

    const birthDate = normalizeBirthDateParts(req.body?.birthYear, req.body?.birthMonth, req.body?.birthDay);
    const birthTimeInfo = normalizeBirthTimeForDb(req.body?.birthTime);
    const genderDb = mapGenderToDb(req.body?.gender);
    const genderForSession = String(req.body?.gender || '').trim().toLowerCase() === 'female' ? 'female' : 'male';
    if (!birthDate || !birthTimeInfo || !genderDb) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID_BIRTH_INPUT',
      });
    }

    const qLoginId = db.convertQ(loginId);

    if (saveAs === 'profile') {
      const profileQuery = `
        EXEC dbo.PJ_USP_MODIFY_USER
          @login_id = '${qLoginId}',
          @user_gender = '${genderDb}',
          @user_birth_date = '${birthDate}',
          @user_birth_time = ${birthTimeInfo.timeSql},
          @birth_time_unknown = ${birthTimeInfo.isUnknown}
      `;
      const rs = await db.query(profileQuery);
      const row = rs && rs[0] ? rs[0] : {};
      if (String(row.resp || 'ERROR').toUpperCase() !== 'OK') {
        return res.status(500).json({
          resp: 'ERROR',
          resp_message: row.resp_message || 'PROFILE_SAVE_FAILED',
        });
      }

      req.session.mypageProfile = {
        birthDate,
        birthTime: birthTimeInfo.timeForSession,
        gender: genderForSession,
      };
      await saveSession(req);

      return res.json({
        resp: 'OK',
        resp_message: 'PROFILE_SAVED',
      });
    }

    const qRelation = db.convertQ(normalizeRelationCode(req.body?.relation));
    const qName = db.convertQ(String(req.body?.name || '상담대상'));
    const relativeQuery = `
      EXEC dbo.PJ_USP_CREATE_RELATIVE
        @relative_id = 0,
        @login_id = '${qLoginId}',
        @relation = '${qRelation}',
        @relative_name = N'${qName}',
        @relative_gender = '${genderDb}',
        @relative_birth_date = '${birthDate}',
        @relative_birth_time = ${birthTimeInfo.timeSql},
        @birth_time_unknown = ${birthTimeInfo.isUnknown}
    `;
    const rs = await db.query(relativeQuery);
    const row = rs && rs[0] ? rs[0] : {};
    if (String(row.resp || 'ERROR').toUpperCase() !== 'OK') {
      return res.status(500).json({
        resp: 'ERROR',
        resp_message: row.resp_message || 'RELATIVE_SAVE_FAILED',
      });
    }

    return res.json({
      resp: 'OK',
      resp_message: 'RELATIVE_SAVED',
      relative_id: Number(row.relative_id || 0),
    });
  } catch (err) {
    console.error('[SAJU SAVE TARGET FROM REQUEST API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'SAVE_TARGET_FAILED',
    });
  }
};

exports.saveResultTargetInfo = async (req, res) => {
  try {
    const loginId = getSessionLoginId(req);
    if (!loginId) {
      return res.status(401).json({
        resp: 'ERROR',
        resp_message: 'LOGIN_REQUIRED',
      });
    }

    const resultId = String(req.params?.resultId || '').trim();
    if (!resultId) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'RESULT_ID_REQUIRED',
      });
    }

    const ownedRecord = await getSajuResultRecordByLoginId(loginId, resultId);
    if (!ownedRecord) {
      return res.status(404).json({
        resp: 'ERROR',
        resp_message: 'RESULT_NOT_FOUND',
      });
    }

    if (String(ownedRecord.status || '').toLowerCase() !== 'completed') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'RESULT_NOT_COMPLETED',
      });
    }

    const requestPayload = ownedRecord.request || {};
    const targetType = normalizeTargetType(requestPayload.targetType, toPositiveInt(requestPayload.relative_id));
    if (targetType !== 'new') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'TARGET_ALREADY_ASSIGNED',
      });
    }

    const saveAs = String(req.body?.save_as || '').trim().toLowerCase();
    if (saveAs !== 'profile' && saveAs !== 'relative') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID_SAVE_TARGET',
      });
    }

    const birthDate = normalizeBirthDateParts(requestPayload.birthYear, requestPayload.birthMonth, requestPayload.birthDay);
    const birthTimeInfo = normalizeBirthTimeForDb(requestPayload.birthTime);
    const genderDb = mapGenderToDb(requestPayload.gender);
    const genderForSession = String(requestPayload.gender || '').trim().toLowerCase() === 'female' ? 'female' : 'male';
    if (!birthDate || !birthTimeInfo || !genderDb) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID_RESULT_BIRTH_DATA',
      });
    }

    if (saveAs === 'profile') {
      const qLoginId = db.convertQ(loginId);
      const profileQuery = `
        EXEC dbo.PJ_USP_MODIFY_USER
          @login_id = '${qLoginId}',
          @user_gender = '${genderDb}',
          @user_birth_date = '${birthDate}',
          @user_birth_time = ${birthTimeInfo.timeSql},
          @birth_time_unknown = ${birthTimeInfo.isUnknown}
      `;
      const rs = await db.query(profileQuery);
      const row = rs && rs[0] ? rs[0] : {};
      if (String(row.resp || 'ERROR').toUpperCase() !== 'OK') {
        return res.status(500).json({
          resp: 'ERROR',
          resp_message: row.resp_message || 'PROFILE_SAVE_FAILED',
        });
      }

      req.session.mypageProfile = {
        birthDate,
        birthTime: birthTimeInfo.timeForSession,
        gender: genderForSession,
      };
      await saveSession(req);

      return res.json({
        resp: 'OK',
        resp_message: 'PROFILE_SAVED',
        resp_action: [{ type: 'alert', value: '내 정보에 생년월일시를 저장했습니다.' }],
      });
    }

    const qLoginId = db.convertQ(loginId);
    const qRelation = db.convertQ(normalizeRelationCode(req.body?.relation));
    const qName = db.convertQ(String(requestPayload.name || '상담대상'));
    const relativeQuery = `
      EXEC dbo.PJ_USP_CREATE_RELATIVE
        @relative_id = 0,
        @login_id = '${qLoginId}',
        @relation = '${qRelation}',
        @relative_name = N'${qName}',
        @relative_gender = '${genderDb}',
        @relative_birth_date = '${birthDate}',
        @relative_birth_time = ${birthTimeInfo.timeSql},
        @birth_time_unknown = ${birthTimeInfo.isUnknown}
    `;
    const rs = await db.query(relativeQuery);
    const row = rs && rs[0] ? rs[0] : {};
    if (String(row.resp || 'ERROR').toUpperCase() !== 'OK') {
      return res.status(500).json({
        resp: 'ERROR',
        resp_message: row.resp_message || 'RELATIVE_SAVE_FAILED',
      });
    }

    return res.json({
      resp: 'OK',
      resp_message: 'RELATIVE_SAVED',
      relative_id: Number(row.relative_id || 0),
      resp_action: [{ type: 'alert', value: '지인으로 등록했습니다. 다음 상담에서 선택할 수 있습니다.' }],
    });
  } catch (err) {
    console.error('[SAJU SAVE TARGET API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'SAVE_TARGET_FAILED',
    });
  }
};

// 하위 호환: 기존 함수명 사용 코드가 있어도 동작하도록 유지합니다.
exports.getSajuFortune = exports.createSajuFortuneRequest;

exports.claudeTest = async (req, res) => {
  const apiKey = process.env.CLAUDE_API_KEY;

  console.log('========================================');
  console.log('Claude API 테스트');
  console.log('API Key 앞 20자:', apiKey?.substring(0, 20));
  console.log('API Key 길이:', apiKey?.length);
  console.log('========================================');

  try {
    const claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{ role: 'user', content: '안녕? 간단하게 인사해줘.' }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      }
    );

    const result = claudeResponse.data.content[0].text;
    console.log('Claude 응답:', result);
    res.send(result);
  } catch (error) {
    console.error('Claude 테스트 실패:', error.response?.data || error.message);
    res.status(500).send(`에러: ${JSON.stringify(error.response?.data || error.message)}`);
  }
};
