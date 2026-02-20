const {
  listSajuResultRecordsByLoginId,
  getSajuResultRecordByLoginId,
} = require('../../api/services/saju_result_store');
const db = require('../../core/utils/db');
const { ALLOWED_RELATION_CODES, RELATION_LABELS, normalizeRelationCode, getRelationLabel } = require('../../core/utils/relation_codes');
const { buildAppUrl } = require('../../core/utils/url');

function isLoggedIn(req) {
  return !!(req && req.session && req.session.user && req.session.user.login_id);
}

function ensureMypageState(req) {
  if (!req.session.mypageProfile) {
    req.session.mypageProfile = {
      birthDate: '',
      birthTime: '',
      gender: '',
    };
  }

  if (!Array.isArray(req.session.mypageRelatives)) {
    req.session.mypageRelatives = [];
  }
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function normalizeText(v) {
  return String(v || '').trim();
}

function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function parseBirthDateInput(body) {
  const direct = normalizeText(body.birthDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    const [y, m, d] = direct.split('-').map((v) => Number(v));
    if (isValidDateParts(y, m, d)) {
      return { birthDate: direct, missingParts: [], invalidDate: false };
    }
    return { birthDate: '', missingParts: [], invalidDate: true };
  }

  const rawYear = normalizeText(body.birthYear);
  const rawMonth = normalizeText(body.birthMonth);
  const rawDay = normalizeText(body.birthDay);
  const missingParts = [];
  if (!rawYear) missingParts.push('생년(연도)');
  if (!rawMonth) missingParts.push('생월(월)');
  if (!rawDay) missingParts.push('생일(일)');
  if (missingParts.length > 0) {
    return { birthDate: '', missingParts, invalidDate: false };
  }

  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  if (!isValidDateParts(year, month, day)) {
    return { birthDate: '', missingParts: [], invalidDate: true };
  }

  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return { birthDate: `${y}-${m}-${d}`, missingParts: [], invalidDate: false };
}

function joinFieldLabels(labels) {
  return labels.join(', ');
}

function normalizePositiveInt(v) {
  const n = Number(v || 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

async function getOrCreateReferralLink(req, loginId) {
  const qLoginId = db.convertQ(String(loginId || ''));
  if (!qLoginId) return '';

  try {
    const query = `
      EXEC dbo.PJ_USP_GET_OR_CREATE_REFERRAL_CODE
        @login_id = '${qLoginId}'
    `;
    const rs = await db.query(query);
    const row = rs && rs[0] ? rs[0] : {};
    if (String(row.resp || 'ERROR').toUpperCase() !== 'OK') return '';
    const inviteCode = String(row.invite_code || '').trim().toUpperCase();
    if (!inviteCode) return '';
    return buildAppUrl(req, `/user/invite/${encodeURIComponent(inviteCode)}`);
  } catch (err) {
    console.error('[REFERRAL LINK ERROR]', err.message);
    return '';
  }
}

function toBoolOption(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function mapGenderToDb(rawGender) {
  const v = String(rawGender || '').trim().toLowerCase();
  if (v === 'male' || v === 'm' || v === '남' || v === '남성') return 'M';
  if (v === 'female' || v === 'f' || v === '여' || v === '여성') return 'F';
  return '';
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

function normalizeDateForInput(rawDate) {
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return rawDate.toISOString().slice(0, 10);
  }
  const value = String(rawDate || '').trim();
  if (!value) return '';
  if (value.includes('T')) return value.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return '';
}

function normalizeTimeForInput(rawTime, birthTimeUnknown = 0) {
  if (Number(birthTimeUnknown || 0) === 1) return '99:99:99';
  if (rawTime instanceof Date && !Number.isNaN(rawTime.getTime())) {
    return rawTime.toISOString().slice(11, 19);
  }
  const value = String(rawTime || '').trim();
  if (!value) return '';
  if (value.includes('T')) {
    const t = value.split('T')[1] || '';
    if (t.length >= 8) return t.slice(0, 8);
  }
  if (value.includes('.')) return value.split('.')[0].slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value;
  return value.slice(0, 8);
}

function normalizeGenderForForm(rawGender) {
  const value = String(rawGender || '').trim().toLowerCase();
  if (value === 'm' || value === 'male' || value === '남' || value === '남성') return 'male';
  if (value === 'f' || value === 'female' || value === '여' || value === '여성') return 'female';
  return '';
}

function requireLoginOrRedirect(req, res) {
  if (!isLoggedIn(req)) {
    res.redirect('/user/login');
    return false;
  }
  return true;
}

const relationOptions = ALLOWED_RELATION_CODES.map((code) => ({
  code,
  label: getRelationLabel(code, 'ko'),
}));

function normalizeRelationInput(rawRelation) {
  const raw = String(rawRelation || '').trim();
  if (!raw) return '';
  const normalizedCode = normalizeRelationCode(raw, '');
  if (normalizedCode) return normalizedCode;

  const koMap = RELATION_LABELS.ko || {};
  const foundCode = Object.keys(koMap).find((code) => String(koMap[code]) === raw);
  return foundCode || '';
}

async function loadMypageCommon(req, options = {}) {
  ensureMypageState(req);

  const loginId = String(req.session.user.login_id || '');
  const qLoginId = db.convertQ(loginId);
  const includeHistory = toBoolOption(options.includeHistory, true);
  const includeTokens = toBoolOption(options.includeTokens, true);
  const includeProfile = toBoolOption(options.includeProfile, true);
  const includeRelatives = toBoolOption(options.includeRelatives, true);
  const includeReferral = toBoolOption(options.includeReferral, false);

  let consultationHistory = [];
  let currentTokens = 0;
  let profileFromDb = req.session.mypageProfile;
  let relativesFromDb = Array.isArray(req.session.mypageRelatives) ? req.session.mypageRelatives : [];
  let referralLink = String(req.session.mypageReferralLink || '');

  const tasks = [];

  if (includeHistory) {
    tasks.push((async () => {
      try {
        consultationHistory = await listSajuResultRecordsByLoginId(loginId, 30);
      } catch (err) {
        console.error('[MYPAGE HISTORY LIST ERROR]', err.message);
        consultationHistory = [];
      }
    })());
  }

  if (includeTokens) {
    tasks.push((async () => {
      try {
        const summaryQuery = `
          EXEC dbo.PJ_USP_GET_TOKEN_SUMMARY
            @login_id = '${qLoginId}'
        `;
        const rs = await db.query(summaryQuery);
        const row = rs && rs[0] ? rs[0] : {};
        if (String(row.resp || '').toUpperCase() === 'OK') {
          currentTokens = Number(row.current_tokens || 0);
        }
      } catch (err) {
        console.error('[MYPAGE TOKEN SUMMARY ERROR]', err.message);
      }
    })());
  }

  if (includeProfile) {
    tasks.push((async () => {
      try {
        const userQuery = `
          SELECT TOP 1
            user_gender,
            user_birth_date,
            user_birth_time,
            birth_time_unknown
          FROM dbo.PJ_TB_USERS WITH (NOLOCK)
          WHERE login_id = '${qLoginId}'
        `;
        const userRs = await db.query(userQuery);
        const userRow = userRs && userRs[0] ? userRs[0] : null;
        if (userRow) {
          profileFromDb = {
            birthDate: normalizeDateForInput(userRow.user_birth_date),
            birthTime: normalizeTimeForInput(userRow.user_birth_time, userRow.birth_time_unknown),
            gender: normalizeGenderForForm(userRow.user_gender),
          };
          req.session.mypageProfile = profileFromDb;
        }
      } catch (err) {
        console.error('[MYPAGE PROFILE LOAD ERROR]', err.message);
      }
    })());
  }

  if (includeRelatives) {
    tasks.push((async () => {
      try {
        const relQuery = `
          EXEC dbo.PJ_USP_SELECT_RELATIVES
            @login_id = '${qLoginId}'
        `;
        const relRs = await db.query(relQuery);
        relativesFromDb = (relRs || [])
          .filter((row) => Number(row.relative_id || 0) > 0)
          .map((row) => {
            const relationCode = normalizeRelationInput(row.relation) || 'OTHER';
            return {
              localId: Number(row.relative_id || 0),
              relationType: relationCode,
              relationLabel: getRelationLabel(relationCode, 'ko'),
              name: String(row.relative_name || '').trim(),
              birthDate: normalizeDateForInput(row.relative_birth_date),
              birthTime: normalizeTimeForInput(row.relative_birth_time, row.birth_time_unknown),
              gender: normalizeGenderForForm(row.relative_gender),
              memo: '',
            };
          });
        req.session.mypageRelatives = relativesFromDb;
      } catch (err) {
        console.error('[MYPAGE RELATIVES LOAD ERROR]', err.message);
        relativesFromDb = Array.isArray(req.session.mypageRelatives) ? req.session.mypageRelatives : [];
      }
    })());
  }

  await Promise.all(tasks);

  if (includeReferral) {
    if (!referralLink) {
      referralLink = await getOrCreateReferralLink(req, loginId);
      req.session.mypageReferralLink = referralLink;
    }
  } else {
    referralLink = '';
  }

  return {
    profile: profileFromDb,
    relatives: relativesFromDb,
    relationOptions,
    consultationHistory,
    currentTokens,
    referralLink,
  };
}

const index = async (req, res) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const common = await loadMypageCommon(req, { includeReferral: true });
  const recentHistory = (common.consultationHistory || []).slice(0, 5);

  res.render('user/pages/mypage', {
    ...common,
    recentHistory,
    currentMenu: 'dashboard',
  });
};

const profilePage = async (req, res) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const common = await loadMypageCommon(req, {
    includeTokens: false,
    includeReferral: false,
  });
  res.render('user/pages/mypage_profile', {
    ...common,
    currentMenu: 'profile',
  });
};

const relativesPage = async (req, res) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const common = await loadMypageCommon(req, {
    includeTokens: false,
    includeProfile: false,
    includeReferral: false,
  });
  res.render('user/pages/mypage_relatives', {
    ...common,
    currentMenu: 'relatives',
  });
};

const historyPage = async (req, res) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const common = await loadMypageCommon(req, {
    includeTokens: false,
    includeProfile: false,
    includeReferral: false,
  });
  res.render('user/pages/mypage_history', {
    ...common,
    currentMenu: 'history',
  });
};

const historyDetail = async (req, res) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const loginId = String(req.session.user.login_id || '');
  const resultId = String(req.params?.resultId || '');
  if (!resultId) {
    return res.status(400).send('잘못된 상담 내역 ID입니다.');
  }

  const common = await loadMypageCommon(req, {
    includeTokens: false,
    includeProfile: false,
    includeReferral: false,
  });
  let record = null;
  try {
    record = await getSajuResultRecordByLoginId(loginId, resultId);
  } catch (err) {
    console.error('[MYPAGE HISTORY DETAIL ERROR]', err.message);
    record = null;
  }

  if (!record) {
    return res.status(404).send('상담 내역을 찾을 수 없습니다.');
  }

  return res.render('user/pages/mypage_history_detail', {
    ...common,
    currentMenu: 'history',
    record,
  });
};

const updateProfile = async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({
      resp: 'ERROR',
      resp_message: 'LOGIN REQUIRED',
      resp_action: [{ type: 'alert', value: '로그인이 필요합니다.' }],
    });
  }

  try {
    ensureMypageState(req);

    const birthDateInfo = parseBirthDateInput(req.body);
    const birthDate = birthDateInfo.birthDate;
    const birthTime = normalizeText(req.body.birthTime);
    const gender = normalizeText(req.body.gender);
    const genderDb = mapGenderToDb(gender);
    const birthTimeInfo = normalizeBirthTimeForDb(birthTime);

    const missing = [];
    if (!birthDate) {
      if (birthDateInfo.missingParts.length > 0) {
        missing.push(...birthDateInfo.missingParts);
      } else if (birthDateInfo.invalidDate) {
        missing.push('유효한 생년월일');
      }
    }
    if (!birthTime) missing.push('태어난 시간');
    if (!gender) missing.push('성별');
    if (gender && !genderDb) missing.push('성별 값');
    if (birthTime && !birthTimeInfo) missing.push('태어난 시간 형식');

    if (missing.length > 0) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID INPUT',
        resp_action: [{ type: 'alert', value: `입력 확인: ${joinFieldLabels(missing)}` }],
      });
    }

    const loginId = String(req.session.user.login_id || '');
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
        resp_message: row.resp_message || 'PROFILE_UPDATE_FAILED',
        resp_action: [{ type: 'alert', value: row.resp_message || '프로필 저장에 실패했습니다.' }],
      });
    }

    req.session.mypageProfile = {
      birthDate,
      birthTime: birthTimeInfo.timeForSession,
      gender,
    };

    await saveSession(req);

    return res.json({
      resp: 'OK',
      resp_message: 'PROFILE UPDATED',
      resp_action: [
        { type: 'alert', value: '내 정보가 저장되었습니다.' },
        { type: 'reload' },
      ],
    });
  } catch (err) {
    console.error('[MYPAGE PROFILE ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'SERVER ERROR',
      resp_action: [{ type: 'alert', value: '저장 중 오류가 발생했습니다.' }],
    });
  }
};

const createRelative = async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({
      resp: 'ERROR',
      resp_message: 'LOGIN REQUIRED',
      resp_action: [{ type: 'alert', value: '로그인이 필요합니다.' }],
    });
  }

  try {
    ensureMypageState(req);

    const relationType = normalizeRelationInput(req.body.relationType);
    const name = normalizeText(req.body.name);
    const birthDateInfo = parseBirthDateInput(req.body);
    const birthDate = birthDateInfo.birthDate;
    const birthTime = normalizeText(req.body.birthTime);
    const gender = normalizeText(req.body.gender);

    const missing = [];
    if (!relationType) missing.push('관계');
    if (!name) missing.push('이름');
    if (!birthDate) {
      if (birthDateInfo.missingParts.length > 0) {
        missing.push(...birthDateInfo.missingParts);
      } else if (birthDateInfo.invalidDate) {
        missing.push('유효한 생년월일');
      }
    }
    if (!birthTime) missing.push('태어난 시간');
    if (!gender) missing.push('성별');

    if (missing.length > 0) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID INPUT',
        resp_action: [{ type: 'alert', value: `입력 확인: ${joinFieldLabels(missing)}` }],
      });
    }

    const loginId = String(req.session.user.login_id || '');
    const qLoginId = db.convertQ(loginId);
    const genderDb = mapGenderToDb(gender);
    const birthTimeInfo = normalizeBirthTimeForDb(birthTime);
    const relationCode = normalizeRelationInput(relationType) || 'OTHER';
    const qRelation = db.convertQ(relationCode);
    const qName = db.convertQ(name);

    if (!genderDb || !birthTimeInfo) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID INPUT',
        resp_action: [{ type: 'alert', value: '성별 또는 시간 형식을 확인해주세요.' }],
      });
    }

    const createQuery = `
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
    const rs = await db.query(createQuery);
    const row = rs && rs[0] ? rs[0] : {};
    if (String(row.resp || 'ERROR').toUpperCase() !== 'OK') {
      return res.status(500).json({
        resp: 'ERROR',
        resp_message: row.resp_message || 'RELATIVE_CREATE_FAILED',
        resp_action: [{ type: 'alert', value: row.resp_message || '지인 등록에 실패했습니다.' }],
      });
    }

    const common = await loadMypageCommon(req, {
      includeHistory: false,
      includeTokens: false,
      includeProfile: false,
      includeRelatives: true,
      includeReferral: false,
    });
    req.session.mypageRelatives = common.relatives;
    await saveSession(req);

    return res.json({
      resp: 'OK',
      resp_message: 'RELATIVE CREATED',
      resp_action: [
        { type: 'alert', value: '지인 정보가 등록되었습니다.' },
        { type: 'reload' },
      ],
    });
  } catch (err) {
    console.error('[MYPAGE RELATIVE CREATE ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'SERVER ERROR',
      resp_action: [{ type: 'alert', value: '등록 중 오류가 발생했습니다.' }],
    });
  }
};

const updateRelative = async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({
      resp: 'ERROR',
      resp_message: 'LOGIN REQUIRED',
      resp_action: [{ type: 'alert', value: '로그인이 필요합니다.' }],
    });
  }

  try {
    ensureMypageState(req);

    const localId = normalizePositiveInt(req.body.localId);
    const relationType = normalizeRelationInput(req.body.relationType);
    const name = normalizeText(req.body.name);
    const birthDateInfo = parseBirthDateInput(req.body);
    const birthDate = birthDateInfo.birthDate;
    const birthTime = normalizeText(req.body.birthTime);
    const gender = normalizeText(req.body.gender);
    const missing = [];
    if (!localId) missing.push('지인 ID');
    if (!relationType) missing.push('관계');
    if (!name) missing.push('이름');
    if (!birthDate) {
      if (birthDateInfo.missingParts.length > 0) {
        missing.push(...birthDateInfo.missingParts);
      } else if (birthDateInfo.invalidDate) {
        missing.push('유효한 생년월일');
      }
    }
    if (!birthTime) missing.push('태어난 시간');
    if (!gender) missing.push('성별');

    if (missing.length > 0) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID INPUT',
        resp_action: [{ type: 'alert', value: `입력 확인: ${joinFieldLabels(missing)}` }],
      });
    }

    const loginId = String(req.session.user.login_id || '');
    const qLoginId = db.convertQ(loginId);
    const genderDb = mapGenderToDb(gender);
    const birthTimeInfo = normalizeBirthTimeForDb(birthTime);
    const relationCode = normalizeRelationInput(relationType) || 'OTHER';
    const qRelation = db.convertQ(relationCode);
    const qName = db.convertQ(name);

    if (!genderDb || !birthTimeInfo) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID INPUT',
        resp_action: [{ type: 'alert', value: '성별 또는 시간 형식을 확인해주세요.' }],
      });
    }

    const updateQuery = `
      EXEC dbo.PJ_USP_CREATE_RELATIVE
        @relative_id = ${localId},
        @login_id = '${qLoginId}',
        @relation = '${qRelation}',
        @relative_name = N'${qName}',
        @relative_gender = '${genderDb}',
        @relative_birth_date = '${birthDate}',
        @relative_birth_time = ${birthTimeInfo.timeSql},
        @birth_time_unknown = ${birthTimeInfo.isUnknown}
    `;
    const rs = await db.query(updateQuery);
    const row = rs && rs[0] ? rs[0] : {};
    if (String(row.resp || 'ERROR').toUpperCase() !== 'OK') {
      return res.status(500).json({
        resp: 'ERROR',
        resp_message: row.resp_message || 'RELATIVE_UPDATE_FAILED',
        resp_action: [{ type: 'alert', value: row.resp_message || '지인 수정에 실패했습니다.' }],
      });
    }

    const common = await loadMypageCommon(req, {
      includeHistory: false,
      includeTokens: false,
      includeProfile: false,
      includeRelatives: true,
      includeReferral: false,
    });
    req.session.mypageRelatives = common.relatives;
    await saveSession(req);

    return res.json({
      resp: 'OK',
      resp_message: 'RELATIVE UPDATED',
      resp_action: [{ type: 'alert', value: '지인 정보가 수정되었습니다.' }],
    });
  } catch (err) {
    console.error('[MYPAGE RELATIVE UPDATE ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'SERVER ERROR',
      resp_action: [{ type: 'alert', value: '수정 중 오류가 발생했습니다.' }],
    });
  }
};

const deleteRelative = async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({
      resp: 'ERROR',
      resp_message: 'LOGIN REQUIRED',
      resp_action: [{ type: 'alert', value: '로그인이 필요합니다.' }],
    });
  }

  try {
    ensureMypageState(req);

    const localId = normalizePositiveInt(req.body.localId);
    if (!localId) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID INPUT',
        resp_action: [{ type: 'alert', value: '삭제할 지인 ID가 올바르지 않습니다.' }],
      });
    }

    const loginId = String(req.session.user.login_id || '');
    const qLoginId = db.convertQ(loginId);
    const deleteQuery = `
      DELETE FROM dbo.PJ_TB_RELATIVES
      WHERE login_id = '${qLoginId}'
        AND relative_id = ${localId}
    `;
    const result = await db.query(deleteQuery);
    const affected = Array.isArray(result) && result[0] && typeof result[0].affectedRows !== 'undefined'
      ? Number(result[0].affectedRows || 0)
      : 0;
    if (!affected) {
      // mssql 드라이버 반환 포맷이 다를 수 있어 존재 재조회로 보강 확인
      const existsQuery = `
        SELECT TOP 1 relative_id
        FROM dbo.PJ_TB_RELATIVES WITH (NOLOCK)
        WHERE login_id = '${qLoginId}'
          AND relative_id = ${localId}
      `;
      const existsRs = await db.query(existsQuery);
      if (existsRs && existsRs[0] && Number(existsRs[0].relative_id || 0) > 0) {
        return res.status(500).json({
          resp: 'ERROR',
          resp_message: 'RELATIVE_DELETE_FAILED',
          resp_action: [{ type: 'alert', value: '지인 삭제에 실패했습니다.' }],
        });
      }
    }

    const common = await loadMypageCommon(req, {
      includeHistory: false,
      includeTokens: false,
      includeProfile: false,
      includeRelatives: true,
      includeReferral: false,
    });
    req.session.mypageRelatives = common.relatives;
    if ((common.relatives || []).some((item) => Number(item.localId) === localId)) {
      return res.status(404).json({
        resp: 'ERROR',
        resp_message: 'RELATIVE NOT FOUND',
        resp_action: [{ type: 'alert', value: '삭제할 지인 정보를 찾을 수 없습니다.' }],
      });
    }

    await saveSession(req);

    return res.json({
      resp: 'OK',
      resp_message: 'RELATIVE DELETED',
      resp_action: [
        { type: 'alert', value: '지인 정보가 삭제되었습니다.' },
        { type: 'reload' },
      ],
    });
  } catch (err) {
    console.error('[MYPAGE RELATIVE DELETE ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'SERVER ERROR',
      resp_action: [{ type: 'alert', value: '삭제 중 오류가 발생했습니다.' }],
    });
  }
};

module.exports = {
  index,
  profilePage,
  relativesPage,
  historyPage,
  historyDetail,
  updateProfile,
  createRelative,
  updateRelative,
  deleteRelative,
};
