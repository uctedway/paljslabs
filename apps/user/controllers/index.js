const path = require('path');
const db = require('../../core/utils/db');
const { normalizeRelationCode, getRelationLabel, RELATION_LABELS } = require('../../core/utils/relation_codes');
const authController = require('./auth');

function isLoggedIn(req) {
  return !!(req && req.session && req.session.user && req.session.user.login_id);
}

function requireLoginOrRedirect(req, res) {
  if (!isLoggedIn(req)) {
    res.redirect('/user/login');
    return false;
  }
  return true;
}

function getSessionLoginId(req) {
  try {
    return String(req.session.user.login_id || '');
  } catch (e) {
    return '';
  }
}

function normalizeRelationInput(rawRelation) {
  const raw = String(rawRelation || '').trim();
  if (!raw) return '';
  const normalizedCode = normalizeRelationCode(raw, '');
  if (normalizedCode) return normalizedCode;
  const koMap = RELATION_LABELS.ko || {};
  const foundCode = Object.keys(koMap).find((code) => String(koMap[code]) === raw);
  return foundCode || '';
}

function normalizeRelativesForUi(list) {
  const relatives = Array.isArray(list) ? list : [];
  return relatives.map((item) => {
    const relationCode = normalizeRelationInput(item?.relationType) || 'OTHER';
    return {
      ...item,
      relationType: relationCode,
      relationLabel: getRelationLabel(relationCode, 'ko'),
    };
  });
}

function normalizeReferralCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  return /^[A-Z0-9]{8,32}$/.test(code) ? code : '';
}

function mapLoginErrorMessage(errorCode) {
  const code = String(errorCode || '').trim().toLowerCase();
  if (!code) return '';
  const table = {
    consent_required: '회원가입을 진행하려면 이용약관과 개인정보처리방침 동의가 필요합니다.',
    social_user_not_found: '가입된 계정이 없습니다. 회원가입 후 로그인해주세요.',
    social_user_exists: '이미 가입된 계정입니다. 로그인으로 이용해주세요.',
    kakao_state: '카카오 로그인 상태 검증에 실패했습니다. 로그인 페이지에서 다시 시도해주세요.',
    kakao_token: '카카오 토큰 교환에 실패했습니다. Redirect URI/플랫폼 도메인/REST API 키 또는 Client Secret 설정을 확인해주세요.',
    kakao_profile: '카카오 프로필 정보를 가져오지 못했습니다. 동의 항목을 확인하고 다시 시도해주세요.',
    kakao_session: '카카오 로그인 세션을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.',
    kakao_signup: '카카오 회원가입 처리에 실패했습니다. 관리자에게 문의해주세요.',
    kakao_auth: '카카오 인증 처리 중 오류가 발생했습니다.',
    apple_state: 'Apple 로그인 상태 검증에 실패했습니다. 로그인 페이지에서 다시 시도해주세요.',
    apple_token: 'Apple 토큰 교환에 실패했습니다. Service ID/Key ID/Team ID/Private Key/Redirect URI 설정을 확인해주세요.',
    apple_profile: 'Apple 프로필 정보를 가져오지 못했습니다.',
    apple_session: 'Apple 로그인 세션을 생성하지 못했습니다.',
    apple_signup: 'Apple 회원가입 처리에 실패했습니다.',
    apple_auth: 'Apple 인증 처리 중 오류가 발생했습니다.',
    naver_state: '네이버 로그인 상태 검증에 실패했습니다. 로그인 페이지에서 다시 시도해주세요.',
    naver_profile: '네이버 프로필 정보를 가져오지 못했습니다.',
    naver_session: '네이버 로그인 세션을 생성하지 못했습니다.',
    naver_signup: '네이버 회원가입 처리에 실패했습니다.',
    naver_auth: '네이버 인증 처리 중 오류가 발생했습니다.',
  };
  return table[code] || '소셜 로그인 처리 중 오류가 발생했습니다.';
}

function hasEnv(...keys) {
  return keys.every((key) => String(process.env[key] || '').trim());
}

function getBillingProviderConfigs() {
  const providers = [
    {
      code: 'KAKAOPAY',
      label: '카카오페이',
      icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/kakaotalk.svg',
      enabled: hasEnv('KAKAOPAY_CID', 'KAKAOPAY_SECRET_KEY', 'KAKAOPAY_READY_URL', 'KAKAOPAY_APPROVE_URL'),
    },
    {
      code: 'NAVERPAY',
      label: '네이버페이',
      icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/naver.svg',
      enabled: hasEnv('NAVERPAY_CLIENT_ID', 'NAVERPAY_CLIENT_SECRET', 'NAVERPAY_CHAIN_ID', 'NAVERPAY_READY_URL', 'NAVERPAY_APPROVE_URL'),
    },
    {
      code: 'PAYPAL',
      label: 'PayPal',
      icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/paypal.svg',
      enabled: hasEnv('PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_TOKEN_URL', 'PAYPAL_CREATE_ORDER_URL', 'PAYPAL_CAPTURE_ORDER_URL'),
    },
  ];

  let defaultProvider = providers.find((p) => p.enabled && p.code === 'PAYPAL')?.code || '';
  if (!defaultProvider) {
    defaultProvider = providers.find((p) => p.enabled)?.code || 'PAYPAL';
  }

  return { providers, defaultProvider };
}

/**
 * 유저 인덱스 페이지
 */
const index = (req, res) => {
  res.send('User Index');
};

/**
 * 로그인 페이지
 */
const login = (req, res) => {
  const referralCode = normalizeReferralCode(req.query?.ref);
  if (referralCode) {
    req.session.pendingReferralCode = referralCode;
  }
  req.session.socialAuthIntent = 'login';
  delete req.session.signupConsentAgreed;

  const naverLoginUrl = authController.getNaverLoginUrl(req, 'login');
  const naverCallbackUrl = authController.buildNaverCallbackUrl(req);
  const kakaoLoginUrl = authController.getKakaoLoginUrl(req, 'login');
  const kakaoCallbackUrl = authController.buildKakaoCallbackUrl(req);
  const appleLoginUrl = authController.getAppleLoginUrl(req, 'login');
  const appleCallbackUrl = authController.buildAppleCallbackUrl(req);

  res.render('user/pages/login', {
    authMode: 'login',
    googleClientId: '919882682607-edggad0pdf5itc8qb0a9sogo71711ero.apps.googleusercontent.com',
    naverLoginUrl,
    naverCallbackUrl,
    kakaoLoginUrl,
    kakaoCallbackUrl,
    appleLoginUrl,
    appleCallbackUrl,
    loginErrorMessage: mapLoginErrorMessage(req.query?.error),
    pendingReferralCode: normalizeReferralCode(req.session?.pendingReferralCode),
  });
};

const inviteEntry = (req, res) => {
  const referralCode = normalizeReferralCode(req.params?.code);
  if (referralCode) {
    req.session.pendingReferralCode = referralCode;
  }
  return res.redirect(referralCode ? `/user/register?ref=${encodeURIComponent(referralCode)}` : '/user/register');
};

/**
 * 회원가입 페이지
 */
const register = (req, res) => {
  const referralCode = normalizeReferralCode(req.query?.ref);
  if (referralCode) {
    req.session.pendingReferralCode = referralCode;
  }
  req.session.socialAuthIntent = 'register';
  req.session.signupConsentAgreed = false;

  const naverLoginUrl = authController.getNaverLoginUrl(req, 'register');
  const naverCallbackUrl = authController.buildNaverCallbackUrl(req);
  const kakaoLoginUrl = authController.getKakaoLoginUrl(req, 'register');
  const kakaoCallbackUrl = authController.buildKakaoCallbackUrl(req);
  const appleLoginUrl = authController.getAppleLoginUrl(req, 'register');
  const appleCallbackUrl = authController.buildAppleCallbackUrl(req);

  res.render('user/pages/login', {
    authMode: 'register',
    googleClientId: '919882682607-edggad0pdf5itc8qb0a9sogo71711ero.apps.googleusercontent.com',
    naverLoginUrl,
    naverCallbackUrl,
    kakaoLoginUrl,
    kakaoCallbackUrl,
    appleLoginUrl,
    appleCallbackUrl,
    loginErrorMessage: mapLoginErrorMessage(req.query?.error),
    pendingReferralCode: normalizeReferralCode(req.session?.pendingReferralCode),
  });
};

/**
 * 이메일 로그인 화면(렌더 전용)
 */
const emailLogin = (req, res) => {
  res.render('user/pages/email_login', {
    title: '이메일 로그인',
  });
};

/**
 * 이메일 회원가입 화면(렌더 전용)
 */
const emailRegister = (req, res) => {
  const referralCode = normalizeReferralCode(req.query?.ref);
  if (referralCode) {
    req.session.pendingReferralCode = referralCode;
  }
  res.render('user/pages/email_register', {
    title: '이메일 회원가입',
    pendingReferralCode: normalizeReferralCode(req.session?.pendingReferralCode),
  });
};

const welcome = (req, res) => {
  const isPreviewMode = String(process.env.WELCOME_PREVIEW || '').trim() === '1';
  if (!isPreviewMode && !requireLoginOrRedirect(req, res)) return;
  const userName = String(req.session?.user?.user_name || '').trim() || (isPreviewMode ? '체험회원' : '회원님');
  const welcomeContext = req.session?.welcomeContext || (isPreviewMode ? { referralApplied: false } : {});
  const referralApplied = Number(welcomeContext.referralApplied ? 1 : 0) === 1;
  if (!isPreviewMode) {
    delete req.session.welcomeContext;
  }
  res.render('user/pages/welcome', {
    title: '가입을 축하합니다',
    userName,
    referralApplied,
  });
};

/**
 * 결제/토큰 페이지
 */
const billing = (req, res) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const providerConfig = getBillingProviderConfigs();
  res.render('user/pages/billing', {
    title: '토큰 충전',
    paymentProviders: providerConfig.providers,
    defaultPaymentProvider: providerConfig.defaultProvider,
  });
};

/**
 * 결제 히스토리 페이지
 */
const purchaseHistory = async (req, res) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const loginId = getSessionLoginId(req);
  const qLoginId = db.convertQ(loginId);

  let payments = [];
  try {
    const query = `
      EXEC dbo.PJ_USP_SELECT_PAYMENT_HISTORY_BY_LOGIN_ID
        @login_id = '${qLoginId}',
        @top_n = 100
    `;

    payments = await db.query(query);
  } catch (err) {
    console.error('[PURCHASE HISTORY ERROR]', err.message);
    payments = [];
  }

  res.render('user/pages/purchase_history', {
    title: '결제 내역',
    payments,
    consultationHistory: [],
    relatives: normalizeRelativesForUi(req.session?.mypageRelatives),
  });
};

const tokenUsageHistory = async (req, res) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const loginId = getSessionLoginId(req);
  const qLoginId = db.convertQ(loginId);

  let usages = [];
  try {
    const query = `
      EXEC dbo.PJ_USP_SELECT_TOKEN_LEDGER_BY_LOGIN_ID
        @login_id = '${qLoginId}',
        @top_n = 200
    `;
    usages = await db.query(query);
  } catch (err) {
    console.error('[TOKEN USAGE HISTORY ERROR]', err.message);
    usages = [];
  }

  res.render('user/pages/token_usage_history', {
    title: '토큰 사용내역',
    usages,
    consultationHistory: [],
    relatives: normalizeRelativesForUi(req.session?.mypageRelatives),
  });
};

const billingResult = async (req, res, resultType) => {
  if (!requireLoginOrRedirect(req, res)) return;

  const loginId = getSessionLoginId(req);
  const qLoginId = db.convertQ(loginId);
  const paymentId = Number(req.query?.payment_id || 0) || 0;

  let currentTokens = -1;
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
    console.error('[BILLING RESULT TOKEN ERROR]', err.message);
  }

  res.render('user/pages/billing_result', {
    title: '결제 결과',
    resultType,
    paymentId,
    currentTokens,
  });
};

const billingSuccess = async (req, res) => billingResult(req, res, 'success');
const billingCanceled = async (req, res) => billingResult(req, res, 'canceled');
const billingFailed = async (req, res) => billingResult(req, res, 'failed');

/**
 * 로그아웃
 */
const logout = (req, res) => {
  if (!req.session) {
    return res.redirect('/');
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('[LOGOUT ERROR]', err);
      return res.redirect('/');
    }

    res.clearCookie('48lab.sid');
    return res.redirect('/');
  });
};

module.exports = {
  index,
  login,
  inviteEntry,
  logout,
  register,
  emailLogin,
  emailRegister,
  welcome,
  billing,
  purchaseHistory,
  tokenUsageHistory,
  billingSuccess,
  billingCanceled,
  billingFailed,
};
