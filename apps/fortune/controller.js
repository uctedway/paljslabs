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
    introTitle: '궁합은 잘 맞고 안 맞고를 단정하는 도구가 아니라, 관계의 리듬을 읽는 분석입니다.',
    introDescription:
      '두 사람의 성향 구조와 시간 흐름을 함께 보며, 충돌 지점과 시너지를 현실적으로 정리합니다. 연인·부부·가족·동업 등 관계 유형에 맞춰 해석 관점을 달리합니다.',
    introHighlights: [
      {
        title: '무엇을 보나?',
        text: '감정 표현 방식, 갈등 패턴, 회복 포인트, 협업 시너지 구간을 분석합니다.',
      },
      {
        title: '왜 필요한가?',
        text: '관계를 유지할지 말지 판단보다, 관계를 운영하는 방법을 찾는 데 도움이 됩니다.',
      },
      {
        title: '어떻게 활용하나?',
        text: '대화 방식 조정, 중요한 일정 선택, 역할 분담 같은 실천 전략으로 연결합니다.',
      },
    ],
    fields: ['subjectAName', 'subjectAGender', 'subjectAData', 'subjectBName', 'subjectBGender', 'subjectBData', 'relationship'],
  },
  today: {
    key: 'today',
    title: '오늘의 운세',
    description: '오늘 하루의 핵심 흐름과 실천 포인트를 안내합니다.',
    cta: '오늘의 운세 보기',
    introTitle: '오늘의 운세는 하루 전체를 예언하는 것이 아니라, 오늘의 집중 포인트를 제시합니다.',
    introDescription:
      '일, 금전, 관계, 건강 중 무엇에 힘을 실어야 하는지 빠르게 파악할 수 있게 구성했습니다. 바쁜 일정 속에서도 우선순위를 정하기 쉽게 돕습니다.',
    introHighlights: [
      {
        title: '무엇을 보나?',
        text: '오늘 유리한 행동, 피로 누적 구간, 대화/결정 타이밍을 간단히 요약합니다.',
      },
      {
        title: '왜 필요한가?',
        text: '하루 계획을 세울 때 시행착오를 줄이고 에너지를 효율적으로 배분할 수 있습니다.',
      },
      {
        title: '어떻게 활용하나?',
        text: '중요 미팅 시간 조정, 연락 우선순위 설정, 지출 타이밍 체크에 활용합니다.',
      },
    ],
    fields: ['name', 'gender', 'birthData', 'focusArea'],
  },
  flow: {
    key: 'flow',
    title: '대운·세운',
    description: '연/월 단위 흐름을 보고 타이밍 전략을 잡습니다.',
    cta: '대운·세운 보기',
    introTitle: '대운·세운은 인생의 큰 사이클과 현재의 세부 변화를 함께 읽는 장기 전략 도구입니다.',
    introDescription:
      '단기 감정보다 중장기 흐름을 기준으로 계획을 점검할 때 유용합니다. 변곡점과 완급 조절 구간을 구분해 의사결정 밀도를 높입니다.',
    introHighlights: [
      {
        title: '무엇을 보나?',
        text: '확장기/정비기/전환기 같은 시기별 기조와 리스크 관리 포인트를 파악합니다.',
      },
      {
        title: '왜 필요한가?',
        text: '진로, 사업, 이직, 투자처럼 타이밍이 중요한 선택에서 기준선을 확보할 수 있습니다.',
      },
      {
        title: '어떻게 활용하나?',
        text: '실행 시점과 준비 시점을 분리해, 무리한 확장이나 과도한 보수성을 줄입니다.',
      },
    ],
    fields: ['name', 'gender', 'birthData', 'targetPeriod'],
  },
  naming: {
    key: 'naming',
    title: '작명/개명 보조',
    description: '원국 보완 방향으로 이름 후보를 평가합니다.',
    cta: '작명 보조 요청',
    introTitle: '작명/개명 보조는 “좋은 이름”을 단일 기준으로 고르기보다, 후보의 방향성을 비교합니다.',
    introDescription:
      '발음, 사용성, 이미지, 원국 보완 관점을 함께 봐서 실제로 오래 사용할 수 있는 이름을 찾습니다. 가족 의견이 갈릴 때 비교 자료로도 활용됩니다.',
    introHighlights: [
      {
        title: '무엇을 보나?',
        text: '후보별 어감, 의미, 보완 포인트, 실사용 적합도를 다각도로 점검합니다.',
      },
      {
        title: '왜 필요한가?',
        text: '직관에 의존한 선택에서 벗어나, 선택 근거를 명확하게 정리할 수 있습니다.',
      },
      {
        title: '어떻게 활용하나?',
        text: '최종 후보 2~3개를 압축한 뒤 가족/팀과 합의할 때 객관 자료로 사용합니다.',
      },
    ],
    fields: ['name', 'gender', 'birthData', 'candidateName'],
  },
  'date-selection': {
    key: 'date-selection',
    title: '택일',
    description: '목적에 맞는 날짜/시간 후보의 적합도를 봅니다.',
    cta: '택일 분석하기',
    introTitle: '택일은 중요한 날짜를 “좋다/나쁘다”로 단순 분류하기보다 목적 적합도를 비교하는 방식입니다.',
    introDescription:
      '이사, 계약, 개업, 결혼, 수술처럼 이벤트 성격이 다른 일정은 판단 기준도 달라야 합니다. 여러 후보를 나란히 놓고 실행 안정성을 확인할 수 있습니다.',
    introHighlights: [
      {
        title: '무엇을 보나?',
        text: '이벤트 목적과 시점의 조합, 충돌 가능성, 준비 여유도를 함께 살핍니다.',
      },
      {
        title: '왜 필요한가?',
        text: '감이나 일정 편의만으로 정한 날짜의 불확실성을 줄일 수 있습니다.',
      },
      {
        title: '어떻게 활용하나?',
        text: '여러 후보 중 우선순위를 정하고, 예비 일정까지 포함한 계획안을 만듭니다.',
      },
    ],
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

  const view = String(req.query?.view || '').trim().toLowerCase();
  const isFormView = view === 'form';
  const sajuTargets = isFormView ? await buildSajuTargets(req) : [];

  return res.render(path.join(__dirname, './pages/feature.ejs'), {
    feature,
    pageMode: isFormView ? 'form' : 'intro',
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
