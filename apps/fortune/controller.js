const path = require('path');
const db = require('../core/utils/db');
const { getRelationLabel } = require('../core/utils/relation_codes');
const { getSajuResultRecord } = require('../api/services/saju_result_store');

const FORTUNE_FEATURES = {
  compatibility: {
    key: 'compatibility',
    title: '궁합',
    description: '두 사람의 궁합 흐름과 관계별 포인트를 확인합니다.',
    cta: '궁합 분석하기',
    fields: ['subjectAName', 'subjectAGender', 'subjectAData', 'subjectBName', 'subjectBGender', 'subjectBData', 'relationship'],
  },
  today: {
    key: 'today',
    title: '오늘의 운세',
    description: '오늘 하루의 핵심 흐름과 실천 포인트를 안내합니다.',
    cta: '오늘의 운세 보기',
    fields: ['name', 'gender', 'birthData', 'focusArea'],
  },
  flow: {
    key: 'flow',
    title: '대운·세운',
    description: '연/월 단위 흐름을 보고 타이밍 전략을 잡습니다.',
    cta: '대운·세운 보기',
    fields: ['name', 'gender', 'birthData', 'targetPeriod'],
  },
  naming: {
    key: 'naming',
    title: '작명/개명 보조',
    description: '원국 보완 방향으로 이름 후보를 평가합니다.',
    cta: '작명 보조 요청',
    fields: ['name', 'gender', 'birthData', 'candidateName'],
  },
  'date-selection': {
    key: 'date-selection',
    title: '택일',
    description: '목적에 맞는 날짜/시간 후보의 적합도를 봅니다.',
    cta: '택일 분석하기',
    fields: ['name', 'gender', 'birthData', 'eventType', 'candidateDate'],
  },
};

function getFeature(featureKey) {
  return FORTUNE_FEATURES[String(featureKey || '').trim().toLowerCase()] || null;
}

function normalizeGenderForForm(rawGender) {
  const v = String(rawGender || '').trim().toLowerCase();
  if (v === 'm' || v === 'male' || v === '남' || v === '남성') return 'male';
  if (v === 'f' || v === 'female' || v === '여' || v === '여성') return 'female';
  return '';
}

function normalizeDateForInput(rawDate) {
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return rawDate.toISOString().slice(0, 10);
  }
  const v = String(rawDate || '').trim();
  if (!v) return '';
  if (v.includes('T')) return v.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return '';
}

function normalizeTimeForInput(rawTime, birthTimeUnknown = 0) {
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

async function buildSajuTargets(req) {
  const sessionUser = req.session && req.session.user ? req.session.user : null;
  const profile = req.session && req.session.mypageProfile ? req.session.mypageProfile : {};
  const locale = 'ko';
  let relatives = [];

  if (sessionUser && sessionUser.login_id) {
    try {
      const qLoginId = db.convertQ(sessionUser.login_id);
      const query = `
        EXEC dbo.PJ_USP_SELECT_RELATIVES
          @login_id = '${qLoginId}'
      `;
      const rs = await db.query(query);
      relatives = (rs || []).filter((row) => Number(row.relative_id || 0) > 0);
    } catch (err) {
      console.error('[FORTUNE RELATIVES] load 실패:', err.message);
      relatives = [];
    }
  }

  const sajuTargets = [];
  if (sessionUser) {
    sajuTargets.push({
      type: 'self',
      id: 'self',
      label: `본인 · ${sessionUser.user_name || sessionUser.login_id || '회원'}`,
      name: sessionUser.user_name || '',
      birthDate: profile.birthDate || '',
      birthTime: profile.birthTime || '',
      gender: profile.gender || '',
      relationCode: '',
      relationLabel: '',
    });
  }

  relatives.forEach((relative) => {
    const relationLabel = getRelationLabel(relative.relation, locale);
    sajuTargets.push({
      type: 'relative',
      id: String(relative.relative_id),
      label: `${relationLabel} · ${relative.relative_name || '이름없음'}`,
      name: relative.relative_name || '',
      birthDate: normalizeDateForInput(relative.relative_birth_date),
      birthTime: normalizeTimeForInput(relative.relative_birth_time, relative.birth_time_unknown),
      gender: normalizeGenderForForm(relative.relative_gender),
      relationCode: String(relative.relation || '').toUpperCase(),
      relationLabel,
    });
  });

  return sajuTargets;
}

const index = (req, res) => {
  res.render(path.join(__dirname, './pages/index.ejs'), {
    features: Object.values(FORTUNE_FEATURES),
  });
};

const featurePage = async (req, res) => {
  const feature = getFeature(req.params?.feature);
  if (!feature) {
    return res.status(404).send('존재하지 않는 메뉴입니다.');
  }

  const sajuTargets = await buildSajuTargets(req);

  return res.render(path.join(__dirname, './pages/feature.ejs'), {
    feature,
    sajuTargets,
  });
};

const resultPage = async (req, res) => {
  const resultId = String(req.params?.resultId || '');
  const record = await getSajuResultRecord(resultId);
  if (!record) {
    return res.status(404).send('결과를 찾을 수 없습니다.');
  }

  const reqData = record.request || {};
  const feature = getFeature(reqData.featureKey);
  const featureTitle = feature ? feature.title : '상담';

  if (String(record.status || '') !== 'completed') {
    return res.status(202).send('결과를 준비 중입니다. 잠시 후 다시 시도해주세요.');
  }

  return res.render(path.join(__dirname, './pages/result.ejs'), {
    resultId,
    featureTitle,
    claudeResult: record.result?.claudeResult || '',
    summary: record.result?.summary || '',
  });
};

module.exports = {
  FORTUNE_FEATURES,
  getFeature,
  index,
  featurePage,
  resultPage,
};
