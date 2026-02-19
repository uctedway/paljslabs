const ALLOWED_RELATION_CODES = [
  'SPOUSE',
  'PARENT',
  'GRANDPARENT',
  'SON',
  'DAUGHTER',
  'SIBLING',
  'FAMILY',
  'FRIEND',
  'OTHER',
];

const RELATION_LABELS = {
  ko: {
    SPOUSE: '배우자',
    PARENT: '부모',
    GRANDPARENT: '조부모',
    SON: '아들',
    DAUGHTER: '딸',
    SIBLING: '형제자매',
    FAMILY: '가족',
    FRIEND: '친구',
    OTHER: '기타',
  },
  en: {
    SPOUSE: 'Spouse',
    PARENT: 'Parent',
    GRANDPARENT: 'Grandparent',
    SON: 'Son',
    DAUGHTER: 'Daughter',
    SIBLING: 'Sibling',
    FAMILY: 'Family',
    FRIEND: 'Friend',
    OTHER: 'Other',
  },
};

function getRequestLocale(req) {
  const preferred = String(req?.headers?.['accept-language'] || '').toLowerCase();
  if (preferred.startsWith('en')) return 'en';
  return 'ko';
}

function normalizeRelationCode(raw, fallback = 'FRIEND') {
  const value = String(raw || '').trim().toUpperCase();
  return ALLOWED_RELATION_CODES.includes(value) ? value : fallback;
}

function getRelationLabel(code, locale = 'ko') {
  const normalized = normalizeRelationCode(code, '');
  if (!normalized) return locale === 'en' ? 'Contact' : '지인';
  return RELATION_LABELS[locale]?.[normalized] || RELATION_LABELS.ko[normalized] || normalized;
}

module.exports = {
  ALLOWED_RELATION_CODES,
  RELATION_LABELS,
  getRequestLocale,
  normalizeRelationCode,
  getRelationLabel,
};
