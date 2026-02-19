const { TOKENS_PER_SAJU_REQUEST } = require('./token_constants');
const REQUIRED_TOKENS_PER_SAJU = TOKENS_PER_SAJU_REQUEST;
const { getTokenSummary } = require('./token_wallet');

function getSessionLoginId(req) {
  try {
    return String(req?.session?.user?.login_id || '');
  } catch (e) {
    return '';
  }
}

async function guardSajuService(req) {
  const loginId = getSessionLoginId(req);
  if (!loginId) {
    return {
      ok: false,
      httpStatus: 401,
      respMessage: 'LOGIN_REQUIRED',
      message: '로그인 후 이용 가능합니다.',
    };
  }

  const summary = await getTokenSummary(loginId);
  const resp = String(summary?.resp || 'ERROR').toUpperCase();
  if (resp !== 'OK') {
    return {
      ok: false,
      httpStatus: 500,
      respMessage: summary?.resp_message || 'TOKEN_SUMMARY_FAILED',
      message: '토큰 잔액 조회에 실패했습니다.',
    };
  }

  const currentTokens = Number(summary.current_tokens || 0);
  if (currentTokens < REQUIRED_TOKENS_PER_SAJU) {
    return {
      ok: false,
      httpStatus: 402,
      respMessage: 'INSUFFICIENT_TOKENS',
      message: '토큰이 부족합니다.',
      current_tokens: currentTokens,
      required_tokens: REQUIRED_TOKENS_PER_SAJU,
    };
  }

  return {
    ok: true,
    loginId,
    current_tokens: currentTokens,
    required_tokens: REQUIRED_TOKENS_PER_SAJU,
  };
}

module.exports = {
  REQUIRED_TOKENS_PER_SAJU,
  guardSajuService,
};
