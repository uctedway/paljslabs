const TOKENS_PER_1000_KRW = 10;
const TOKENS_PER_SAJU_REQUEST = 10;
const TOKENS_PER_TRIAL_REQUEST = 3;
const ANALYSIS_MODE_PREMIUM = 'PREMIUM';
const ANALYSIS_MODE_TRIAL = 'TRIAL';

function normalizeAnalysisMode(value) {
  const v = String(value || '').trim().toUpperCase();
  return v === ANALYSIS_MODE_TRIAL ? ANALYSIS_MODE_TRIAL : ANALYSIS_MODE_PREMIUM;
}

function getRequiredTokensByMode(mode) {
  const normalized = normalizeAnalysisMode(mode);
  return normalized === ANALYSIS_MODE_TRIAL
    ? TOKENS_PER_TRIAL_REQUEST
    : TOKENS_PER_SAJU_REQUEST;
}

const TOKEN_PACKAGES = {
  1000: 10,
  3000: 30,
  5000: 50,
  10000: 110,
  100000: 1200,
};

module.exports = {
  TOKENS_PER_1000_KRW,
  TOKENS_PER_SAJU_REQUEST,
  TOKENS_PER_TRIAL_REQUEST,
  ANALYSIS_MODE_PREMIUM,
  ANALYSIS_MODE_TRIAL,
  normalizeAnalysisMode,
  getRequiredTokensByMode,
  TOKEN_PACKAGES,
};
