const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const crypto = require('crypto');
const db = require('../../core/utils/db'); // 실제 경로에 맞게
const { buildAppUrl } = require('../../core/utils/url');

const GOOGLE_CLIENT_ID =
  '919882682607-edggad0pdf5itc8qb0a9sogo71711ero.apps.googleusercontent.com';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/* =========================================
   공용: 회원가입
   - PJ_USP_CREATE_USERS 수정본: id + 기본정보 반환
   - 반환: row (resp/resp_message/id/provider/login_id/email/user_name...)
========================================= */
async function signupUser(provider, login_id, email, user_name, referralCode = '') {
  const q_provider = db.convertQ(provider || '');
  const q_login_id = db.convertQ(login_id || '');
  const q_email = db.convertQ(email || '');
  const q_user_name = db.convertQ(user_name || '');
  const q_referral_code = db.convertQ(String(referralCode || '').trim().toUpperCase());

  const query = `
	EXEC dbo.PJ_USP_CREATE_USERS
	  @provider  = '${q_provider}',
	  @login_id  = '${q_login_id}',
	  @email     = '${q_email}',
	  @user_name = '${q_user_name}',
	  @referral_code = '${q_referral_code}'
  `;
  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : {};
  return row;
}

async function loadUserSessionRow(provider, login_id) {
  const q_provider = db.convertQ(provider || '');
  const q_login_id = db.convertQ(login_id || '');

  const query = `
    EXEC dbo.PJ_USP_GET_USER_SESSION
      @provider = '${q_provider}',
      @login_id = '${q_login_id}'
  `;
  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

async function resolveAuthUser({ provider, login_id, email, user_name, referralCode = '' }) {
  const sessionRow = await loadUserSessionRow(provider, login_id);
  const sessionResp = String(sessionRow.resp || 'ERROR').toUpperCase();
  if (sessionResp === 'OK') {
    return {
      ok: true,
      isNew: false,
      row: sessionRow,
    };
  }

  const sessionMessage = String(sessionRow.resp_message || '').toUpperCase();
  if (sessionMessage !== 'USER NOT FOUND') {
    return {
      ok: false,
      stage: 'session',
      message: String(sessionRow.resp_message || 'USER SESSION LOAD ERROR'),
    };
  }

  const createdUser = await signupUser(provider, login_id, email, user_name, referralCode);
  const createResp = String(createdUser.resp || 'ERROR').toUpperCase();
  if (createResp === 'OK') {
    return {
      ok: true,
      isNew: true,
      row: createdUser,
      referralApplied: Number(createdUser.referral_applied || 0) === 1,
    };
  }

  // 동시 요청 경합으로 이미 생성된 경우 세션 조회를 한 번 더 시도합니다.
  const createMessage = String(createdUser.resp_message || '');
  if (createMessage.toUpperCase().includes('ALREADY EXISTS')) {
    const retryRow = await loadUserSessionRow(provider, login_id);
    const retryResp = String(retryRow.resp || 'ERROR').toUpperCase();
    if (retryResp === 'OK') {
      return {
        ok: true,
        isNew: false,
        row: retryRow,
      };
    }
  }

  return {
    ok: false,
    stage: 'signup',
    message: createMessage || 'USER SIGNUP ERROR',
  };
}

function normalizeReferralCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  return /^[A-Z0-9]{8,32}$/.test(code) ? code : '';
}

function buildNaverCallbackUrl(req) {
  return buildAppUrl(req, '/user/auth/naver/callback');
}

function buildKakaoCallbackUrl(req) {
  return buildAppUrl(req, '/user/auth/kakao/callback');
}

function buildAppleCallbackUrl(req) {
  return buildAppUrl(req, '/user/auth/apple/callback');
}

function buildNaverAuthorizeUrl(req, state) {
  const clientId = String(process.env.NAVER_LOGIN_CLIENT_ID || '').trim();
  if (!clientId) return '';
  const redirectUri = buildNaverCallbackUrl(req);
  const u = new URL('https://nid.naver.com/oauth2.0/authorize');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  return u.toString();
}

function buildKakaoAuthorizeUrl(req, state) {
  const clientId = String(process.env.KAKAO_LOGIN_REST_API_KEY || '').trim();
  if (!clientId) return '';
  const redirectUri = buildKakaoCallbackUrl(req);
  const scope = String(process.env.KAKAO_LOGIN_SCOPE || '').trim();
  const u = new URL('https://kauth.kakao.com/oauth/authorize');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  if (scope) u.searchParams.set('scope', scope);
  return u.toString();
}

function buildAppleAuthorizeUrl(req, state) {
  const clientId = String(process.env.APPLE_LOGIN_CLIENT_ID || '').trim();
  if (!clientId) return '';
  const redirectUri = buildAppleCallbackUrl(req);
  const scope = String(process.env.APPLE_LOGIN_SCOPE || 'name email').trim();
  const u = new URL('https://appleid.apple.com/auth/authorize');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('response_mode', 'form_post');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  if (scope) u.searchParams.set('scope', scope);
  return u.toString();
}

function randomState() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseJwtPayload(idToken) {
  const token = String(idToken || '').trim();
  const chunks = token.split('.');
  if (chunks.length < 2) return {};
  const payload = chunks[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const raw = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(raw);
}

function buildAppleClientSecret() {
  const teamId = String(process.env.APPLE_LOGIN_TEAM_ID || '').trim();
  const clientId = String(process.env.APPLE_LOGIN_CLIENT_ID || '').trim();
  const keyId = String(process.env.APPLE_LOGIN_KEY_ID || '').trim();
  const privateKey = String(process.env.APPLE_LOGIN_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!teamId || !clientId || !keyId || !privateKey) {
    throw new Error('APPLE_LOGIN_ENV_NOT_CONFIGURED');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign('sha256');
  signer.update(data);
  signer.end();
  const signature = signer.sign(privateKey);
  const encodedSig = signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${data}.${encodedSig}`;
}

async function exchangeNaverToken({ code, state, req }) {
  const clientId = String(process.env.NAVER_LOGIN_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.NAVER_LOGIN_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_LOGIN_ENV_NOT_CONFIGURED');
  }

  const u = new URL('https://nid.naver.com/oauth2.0/token');
  u.searchParams.set('grant_type', 'authorization_code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('client_secret', clientSecret);
  u.searchParams.set('code', code);
  u.searchParams.set('state', state);

  const { data } = await axios.get(u.toString(), { timeout: 10000 });
  const accessToken = String(data?.access_token || '').trim();
  if (!accessToken) {
    throw new Error(`NAVER_TOKEN_EXCHANGE_FAILED:${String(data?.error_description || data?.error || '')}`);
  }
  return accessToken;
}

async function fetchNaverUserProfile(accessToken) {
  const { data } = await axios.get('https://openapi.naver.com/v1/nid/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    timeout: 10000,
  });

  if (String(data?.resultcode || '').toUpperCase() !== '00') {
    throw new Error(`NAVER_PROFILE_FAILED:${String(data?.message || '')}`);
  }
  return data?.response || {};
}

async function exchangeKakaoToken({ code, req }) {
  const clientId = String(process.env.KAKAO_LOGIN_REST_API_KEY || '').trim();
  const clientSecret = String(process.env.KAKAO_LOGIN_CLIENT_SECRET || '').trim();
  if (!clientId) {
    throw new Error('KAKAO_LOGIN_ENV_NOT_CONFIGURED');
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', clientId);
  body.set('redirect_uri', buildKakaoCallbackUrl(req));
  body.set('code', code);
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  let data;
  try {
    const resp = await axios.post('https://kauth.kakao.com/oauth/token', body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      timeout: 10000,
    });
    data = resp.data;
  } catch (err) {
    const detail = err?.response?.data
      ? JSON.stringify(err.response.data)
      : String(err.message || '');
    throw new Error(`KAKAO_TOKEN_EXCHANGE_FAILED:${detail}`);
  }

  const accessToken = String(data?.access_token || '').trim();
  if (!accessToken) {
    throw new Error(`KAKAO_TOKEN_EXCHANGE_FAILED:${String(data?.error_description || data?.error || '')}`);
  }
  return accessToken;
}

async function fetchKakaoUserProfile(accessToken) {
  try {
    const { data } = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 10000,
    });
    return data || {};
  } catch (err) {
    const detail = err?.response?.data
      ? JSON.stringify(err.response.data)
      : String(err.message || '');
    throw new Error(`KAKAO_PROFILE_FAILED:${detail}`);
  }
}

async function exchangeAppleToken({ code, req }) {
  const clientId = String(process.env.APPLE_LOGIN_CLIENT_ID || '').trim();
  if (!clientId) {
    throw new Error('APPLE_LOGIN_ENV_NOT_CONFIGURED');
  }
  const clientSecret = buildAppleClientSecret();
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('redirect_uri', buildAppleCallbackUrl(req));

  let data;
  try {
    const resp = await axios.post('https://appleid.apple.com/auth/token', body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    });
    data = resp.data;
  } catch (err) {
    const detail = err?.response?.data
      ? JSON.stringify(err.response.data)
      : String(err.message || '');
    throw new Error(`APPLE_TOKEN_EXCHANGE_FAILED:${detail}`);
  }

  const idToken = String(data?.id_token || '').trim();
  if (!idToken) {
    throw new Error(`APPLE_TOKEN_EXCHANGE_FAILED:${String(data?.error_description || data?.error || '')}`);
  }
  return data;
}

/* =========================================
   공용: 세션 선언 (Redis 세션 구조 유지)
   - web.js 테스트와 동일: req.session.user 사용
========================================= */
function setUserSession(req, userRow) {
  const rawBirthDate = userRow.user_birth_date;
  const rawBirthTime = userRow.user_birth_time;
  const birthUnknown = Number(userRow.birth_time_unknown || 0) === 1;
  const birthDate =
    rawBirthDate instanceof Date
      ? rawBirthDate.toISOString().slice(0, 10)
      : String(rawBirthDate || '').slice(0, 10);
  const birthTime = birthUnknown
    ? '99:99:99'
    : rawBirthTime instanceof Date
      ? rawBirthTime.toISOString().slice(11, 19)
      : String(rawBirthTime || '').slice(0, 8);
  const gender = String(userRow.user_gender || '').toUpperCase() === 'F' ? 'female' : (String(userRow.user_gender || '').toUpperCase() === 'M' ? 'male' : '');

  req.session.user = {
	id: userRow.id || 0,
	provider: userRow.provider || '',
	login_id: userRow.login_id || '',
	email: userRow.email || '',
	user_name: userRow.user_name || '',
	at: Date.now(),
  };
  req.session.mypageProfile = {
	birthDate: birthDate || '',
	birthTime: birthTime || '',
	gender,
  };

  return new Promise((resolve, reject) => {
	req.session.save((err) => {
	  if (err) return reject(err);
	  resolve();
	});
  });
}

/* =========================================
   Google Auth Controller
   - 내부 흐름만 담당
========================================= */
const googleAuth = async (req, res) => {
  try {
	const token = req.body ? req.body.token : '';
	//console.log('token   '+token);
	if (!token) {
	  return res.status(400).json({
		resp: 'ERROR',
		resp_message: 'NO TOKEN',
		resp_action: [{ type: 'alert', value: 'NO TOKEN' }],
	  });
	}

	const ticket = await googleClient.verifyIdToken({
	  idToken: token,
	  audience: GOOGLE_CLIENT_ID,
	});

	const payload = ticket.getPayload();
	if (!payload || !payload.sub) {
	  return res.status(401).json({
		resp: 'ERROR',
		resp_message: 'INVALID GOOGLE TOKEN',
		resp_action: [{ type: 'alert', value: 'INVALID GOOGLE TOKEN' }],
	  });
	}
	
	
	

	const provider = 'GOOGLE';
	const login_id = String(payload.sub);
	const email = payload.email || '';
	const user_name = payload.name || '';
	const referralCode = normalizeReferralCode(req.session?.pendingReferralCode);

	const authResult = await resolveAuthUser({
	  provider,
	  login_id,
	  email,
	  user_name,
	  referralCode,
	});

	if (!authResult.ok) {
	  return res.status(400).json({
		resp: 'ERROR',
		resp_message: authResult.message || 'ERROR',
		resp_action: [{ type: 'alert', value: authResult.message || 'ERROR' }],
	  });
	}

	delete req.session.pendingReferralCode;
	await setUserSession(req, authResult.row);

	if (!authResult.isNew) {
	  delete req.session.welcomeContext;
	  return res.json({
		resp: 'OK',
		resp_message: 'OK',
		resp_action: [{ type: 'redirect', value: '/user/mypage' }],
	  });
	}

	req.session.welcomeContext = {
	  isNewSignup: true,
	  referralApplied: !!authResult.referralApplied,
	};
	await new Promise((resolve, reject) => {
	  req.session.save((err) => {
		if (err) return reject(err);
		resolve();
	  });
	});
	return res.json({
	  resp: 'OK',
	  resp_message: 'OK',
	  resp_action: [{ type: 'redirect', value: '/user/welcome' }],
	});
  } catch (err) {
	console.error('[GOOGLE AUTH ERROR]', err);
	return res.status(401).send('INVALID GOOGLE TOKEN');
  }
};

const naverAuthCallback = async (req, res) => {
  try {
    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    const expectedState = String(req.session?.naverLoginState || '').trim();
    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect('/user/login?error=naver_state');
    }

    const accessToken = await exchangeNaverToken({ code, state, req });
    const profile = await fetchNaverUserProfile(accessToken);
    const login_id = String(profile.id || '').trim();
    if (!login_id) {
      return res.redirect('/user/login?error=naver_profile');
    }

    const provider = 'NAVER';
    const email = String(profile.email || '').trim();
    const user_name = String(profile.name || profile.nickname || '').trim() || '회원';
    const referralCode = normalizeReferralCode(req.session?.pendingReferralCode);

    const authResult = await resolveAuthUser({
      provider,
      login_id,
      email,
      user_name,
      referralCode,
    });
    if (!authResult.ok) {
      return res.redirect(`/user/login?error=${authResult.stage === 'session' ? 'naver_session' : 'naver_signup'}`);
    }

    delete req.session.pendingReferralCode;
    delete req.session.naverLoginState;
    await setUserSession(req, authResult.row);
    if (!authResult.isNew) {
      delete req.session.welcomeContext;
      return res.redirect('/user/mypage');
    }

    req.session.welcomeContext = {
      isNewSignup: true,
      referralApplied: !!authResult.referralApplied,
    };
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.redirect('/user/welcome');
  } catch (err) {
    console.error('[NAVER AUTH ERROR]', err);
    return res.redirect('/user/login?error=naver_auth');
  }
};

const kakaoAuthCallback = async (req, res) => {
  try {
    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    const expectedState = String(req.session?.kakaoLoginState || '').trim();
    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect('/user/login?error=kakao_state');
    }

    const accessToken = await exchangeKakaoToken({ code, req });
    const profile = await fetchKakaoUserProfile(accessToken);
    const login_id = String(profile?.id || '').trim();
    if (!login_id) {
      return res.redirect('/user/login?error=kakao_profile');
    }

    const provider = 'KAKAO';
    const rawEmail = String(profile?.kakao_account?.email || '').trim();
    // 카카오 이메일 미동의/미보유 계정 대응: DB 가입 실패를 피하기 위한 대체 이메일
    const email = rawEmail || `${login_id}@kakao.local`;
    const user_name = String(profile?.kakao_account?.profile?.nickname || '').trim() || '회원';
    const referralCode = normalizeReferralCode(req.session?.pendingReferralCode);

    const authResult = await resolveAuthUser({
      provider,
      login_id,
      email,
      user_name,
      referralCode,
    });
    if (!authResult.ok) {
      return res.redirect(`/user/login?error=${authResult.stage === 'session' ? 'kakao_session' : 'kakao_signup'}`);
    }

    delete req.session.pendingReferralCode;
    delete req.session.kakaoLoginState;
    await setUserSession(req, authResult.row);
    if (!authResult.isNew) {
      delete req.session.welcomeContext;
      return res.redirect('/user/mypage');
    }

    req.session.welcomeContext = {
      isNewSignup: true,
      referralApplied: !!authResult.referralApplied,
    };
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.redirect('/user/welcome');
  } catch (err) {
    console.error('[KAKAO AUTH ERROR]', err);
    const msg = String(err?.message || '');
    if (msg.startsWith('KAKAO_TOKEN_EXCHANGE_FAILED:')) {
      return res.redirect('/user/login?error=kakao_token');
    }
    if (msg.startsWith('KAKAO_PROFILE_FAILED:')) {
      return res.redirect('/user/login?error=kakao_profile');
    }
    return res.redirect('/user/login?error=kakao_auth');
  }
};

const appleAuthCallback = async (req, res) => {
  try {
    const code = String(req.body?.code || req.query?.code || '').trim();
    const state = String(req.body?.state || req.query?.state || '').trim();
    const expectedState = String(req.session?.appleLoginState || '').trim();
    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect('/user/login?error=apple_state');
    }

    const tokenData = await exchangeAppleToken({ code, req });
    const idTokenPayload = parseJwtPayload(tokenData.id_token);
    const login_id = String(idTokenPayload?.sub || '').trim();
    if (!login_id) {
      return res.redirect('/user/login?error=apple_profile');
    }

    const provider = 'APPLE';
    const email = String(idTokenPayload?.email || `${login_id}@apple.local`).trim();
    const user_name = String(idTokenPayload?.email || '회원').trim();
    const referralCode = normalizeReferralCode(req.session?.pendingReferralCode);

    const authResult = await resolveAuthUser({
      provider,
      login_id,
      email,
      user_name,
      referralCode,
    });
    if (!authResult.ok) {
      return res.redirect(`/user/login?error=${authResult.stage === 'session' ? 'apple_session' : 'apple_signup'}`);
    }

    delete req.session.pendingReferralCode;
    delete req.session.appleLoginState;
    await setUserSession(req, authResult.row);
    if (!authResult.isNew) {
      delete req.session.welcomeContext;
      return res.redirect('/user/mypage');
    }

    req.session.welcomeContext = {
      isNewSignup: true,
      referralApplied: !!authResult.referralApplied,
    };
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.redirect('/user/welcome');
  } catch (err) {
    console.error('[APPLE AUTH ERROR]', err);
    const msg = String(err?.message || '');
    if (msg.startsWith('APPLE_TOKEN_EXCHANGE_FAILED:')) {
      return res.redirect('/user/login?error=apple_token');
    }
    return res.redirect('/user/login?error=apple_auth');
  }
};

const getNaverLoginUrl = (req) => {
  const clientId = String(process.env.NAVER_LOGIN_CLIENT_ID || '').trim();
  if (!clientId) return '';
  const state = randomState();
  req.session.naverLoginState = state;
  return buildNaverAuthorizeUrl(req, state);
};

const getKakaoLoginUrl = (req) => {
  const clientId = String(process.env.KAKAO_LOGIN_REST_API_KEY || '').trim();
  if (!clientId) return '';
  const state = randomState();
  req.session.kakaoLoginState = state;
  return buildKakaoAuthorizeUrl(req, state);
};

const getAppleLoginUrl = (req) => {
  const clientId = String(process.env.APPLE_LOGIN_CLIENT_ID || '').trim();
  if (!clientId) return '';
  const state = randomState();
  req.session.appleLoginState = state;
  return buildAppleAuthorizeUrl(req, state);
};

module.exports = {
  googleAuth,
  naverAuthCallback,
  kakaoAuthCallback,
  appleAuthCallback,
  getNaverLoginUrl,
  getKakaoLoginUrl,
  getAppleLoginUrl,
  buildNaverCallbackUrl,
  buildKakaoCallbackUrl,
  buildAppleCallbackUrl,
};
