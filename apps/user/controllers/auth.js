const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const crypto = require('crypto');
const db = require('../../core/utils/db'); // 실제 경로에 맞게
const { buildAppUrl } = require('../../core/utils/url');

const GOOGLE_CLIENT_ID =
  '919882682607-edggad0pdf5itc8qb0a9sogo71711ero.apps.googleusercontent.com';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const AUTH_INTENTS = new Set(['login', 'register']);

function normalizeAuthIntent(rawIntent) {
  const intent = String(rawIntent || '').trim().toLowerCase();
  return AUTH_INTENTS.has(intent) ? intent : 'login';
}

/* =========================================
   공용: 회원가입
   - PJ_USP_CREATE_USERS 수정본: id + 기본정보 반환
   - 반환: row (resp/resp_message/id/provider/login_id/email/user_name...)
========================================= */
async function signupUser(provider, login_id, email, user_name, referralCode = '', user_pass = '', terms_agreed = 0, privacy_agreed = 0) {
  const q_provider = db.convertQ(provider || '');
  const q_login_id = db.convertQ(login_id || '');
  const q_email = db.convertQ(email || '');
  const q_user_name = db.convertQ(user_name || '');
  const q_referral_code = db.convertQ(String(referralCode || '').trim().toUpperCase());
  const q_user_pass = db.convertQ(user_pass || '');
  const q_terms_agreed = Number(terms_agreed ? 1 : 0);
  const q_privacy_agreed = Number(privacy_agreed ? 1 : 0);

  const query = `
	EXEC dbo.PJ_USP_CREATE_USERS
	  @provider  = '${q_provider}',
	  @login_id  = '${q_login_id}',
	  @email     = '${q_email}',
	  @user_pass = '${q_user_pass}',
	  @terms_agreed = ${q_terms_agreed},
	  @privacy_agreed = ${q_privacy_agreed},
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

async function resolveAuthUser({ provider, login_id, email, user_name, referralCode = '', intent = 'login', user_pass = '', terms_agreed = 0, privacy_agreed = 0 }) {
  const authIntent = normalizeAuthIntent(intent);
  const sessionRow = await loadUserSessionRow(provider, login_id);
  const sessionResp = String(sessionRow.resp || 'ERROR').toUpperCase();
  if (sessionResp === 'OK') {
    if (authIntent === 'register') {
      return {
        ok: false,
        stage: 'signup',
        message: 'USER ALREADY EXISTS',
      };
    }
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

  if (authIntent === 'login') {
    return {
      ok: false,
      stage: 'login',
      message: 'USER NOT FOUND',
    };
  }

  const createdUser = await signupUser(provider, login_id, email, user_name, referralCode, user_pass, terms_agreed, privacy_agreed);
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
    return {
      ok: false,
      stage: 'signup',
      message: 'USER ALREADY EXISTS',
    };
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

function parseAgreeFlag(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'y' || v === 'yes' || v === 'on';
}

function hasSignupConsentInSession(req) {
  return !!(req && req.session && req.session.signupConsentAgreed === true);
}

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase();
}

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function hashUserPasswordLegacy(rawPassword) {
  return crypto.createHash('sha256').update(String(rawPassword || '')).digest('hex');
}

function createSaltedPasswordHash(rawPassword) {
  const password = String(rawPassword || '');
  const iterations = 120000;
  const keylen = 32;
  const digest = 'sha256';
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
  return `pbkdf2$${iterations}$${salt}$${derivedKey}`;
}

function verifyPasswordHash(rawPassword, savedHash) {
  const password = String(rawPassword || '');
  const stored = String(savedHash || '').trim();
  if (!stored) return false;

  // New format: pbkdf2$iterations$salt$hash
  if (stored.startsWith('pbkdf2$')) {
    const chunks = stored.split('$');
    if (chunks.length !== 4) return false;
    const iterations = Number(chunks[1]);
    const salt = chunks[2];
    const expectedHex = chunks[3];
    if (!Number.isFinite(iterations) || iterations <= 0 || !salt || !expectedHex) return false;
    const computedHex = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
    const expected = Buffer.from(expectedHex, 'hex');
    const computed = Buffer.from(computedHex, 'hex');
    if (expected.length !== computed.length) return false;
    return crypto.timingSafeEqual(expected, computed);
  }

  // Backward compatibility: legacy unsalted SHA-256
  const legacyHash = hashUserPasswordLegacy(password);
  if (legacyHash.length !== stored.length) return false;
  return crypto.timingSafeEqual(Buffer.from(legacyHash), Buffer.from(stored));
}

async function loadEmailPasswordHash(login_id) {
  const q_login_id = db.convertQ(login_id || '');
  const query = `
    SELECT TOP 1
      user_pass
    FROM dbo.PJ_TB_USERS WITH (NOLOCK)
    WHERE provider = 'EMAIL'
      AND login_id = '${q_login_id}'
  `;
  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : {};
  return String(row.user_pass || '').trim();
}

function getAuthEntryPathByIntent(intent) {
  return normalizeAuthIntent(intent) === 'register' ? '/user/register' : '/user/login';
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

function getAppleDebugContext(req) {
  const clientId = String(process.env.APPLE_LOGIN_CLIENT_ID || '').trim();
  const teamId = String(process.env.APPLE_LOGIN_TEAM_ID || '').trim();
  const keyId = String(process.env.APPLE_LOGIN_KEY_ID || '').trim();
  const privateKey = String(process.env.APPLE_LOGIN_PRIVATE_KEY || '').trim();
  return {
    client_id: clientId || '(empty)',
    team_id_tail: teamId ? teamId.slice(-4) : '(empty)',
    key_id_tail: keyId ? keyId.slice(-4) : '(empty)',
    has_private_key: privateKey.length > 0,
    private_key_length: privateKey.length,
    redirect_uri: buildAppleCallbackUrl(req),
    app_origin_env: String(process.env.APP_ORIGIN || '').trim() || '(empty)',
    node_env: String(process.env.NODE_ENV || '').trim() || '(empty)',
  };
}

function toHexDigest(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

function getAppleStateSecret() {
  const sessionSecret = String(process.env.SESSION_SECRET || '').trim();
  if (sessionSecret) return sessionSecret;
  return toHexDigest(String(process.env.APPLE_LOGIN_CLIENT_ID || '').trim() || 'apple_state_fallback');
}

function fromBase64Url(input) {
  const s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signAppleStatePayload(encodedPayload) {
  return crypto
    .createHmac('sha256', getAppleStateSecret())
    .update(String(encodedPayload || ''))
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createAppleState(intent) {
  const payload = {
    i: normalizeAuthIntent(intent),
    t: Date.now(),
    n: crypto.randomBytes(12).toString('hex'),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signAppleStatePayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function decodeAppleState(state) {
  const raw = String(state || '').trim();
  if (!raw) return { valid: false, reason: 'EMPTY_STATE' };
  const chunks = raw.split('.');
  if (chunks.length !== 2) return { valid: false, reason: 'INVALID_STATE_FORMAT' };
  const encodedPayload = chunks[0];
  const signature = chunks[1];
  if (!encodedPayload || !signature) return { valid: false, reason: 'INVALID_STATE_CHUNKS' };
  const expectedSig = signAppleStatePayload(encodedPayload);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'STATE_SIGNATURE_MISMATCH' };
  }
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload));
  } catch (e) {
    return { valid: false, reason: 'STATE_PAYLOAD_PARSE_FAILED' };
  }
  const issuedAt = Number(payload?.t || 0);
  const authIntent = normalizeAuthIntent(payload?.i);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
    return { valid: false, reason: 'STATE_INVALID_ISSUED_AT' };
  }
  if (Date.now() - issuedAt > 1000 * 60 * 10) {
    return { valid: false, reason: 'STATE_EXPIRED' };
  }
  return { valid: true, payload: { authIntent, issuedAt } };
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
  console.info('[APPLE AUTHORIZE URL]', {
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    has_state: !!String(state || '').trim(),
    state_prefix: String(state || '').slice(0, 8),
  });
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
  console.info('[APPLE CLIENT SECRET BUILT]', {
    team_id_tail: teamId ? teamId.slice(-4) : '(empty)',
    client_id: clientId || '(empty)',
    key_id_tail: keyId ? keyId.slice(-4) : '(empty)',
    has_private_key: !!privateKey,
    private_key_lines: privateKey ? privateKey.split('\n').length : 0,
  });
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
  console.info('[APPLE TOKEN EXCHANGE START]', {
    ...getAppleDebugContext(req),
    has_code: !!String(code || '').trim(),
  });
  const clientSecret = buildAppleClientSecret();
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('redirect_uri', buildAppleCallbackUrl(req));
  console.info('[APPLE TOKEN REQUEST PAYLOAD]', {
    client_id: clientId,
    redirect_uri: buildAppleCallbackUrl(req),
    grant_type: 'authorization_code',
    has_code: !!String(code || '').trim(),
    has_client_secret: !!clientSecret,
  });

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
    console.error('[APPLE TOKEN EXCHANGE ERROR DETAIL]', {
      ...getAppleDebugContext(req),
      detail,
    });
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
    const authIntent = normalizeAuthIntent(req.body?.intent || req.session?.socialAuthIntent);
    if (authIntent === 'register') {
      const termsAgreed = parseAgreeFlag(req.body?.terms_agreed);
      const privacyAgreed = parseAgreeFlag(req.body?.privacy_agreed);
      if (!(termsAgreed && privacyAgreed) && !hasSignupConsentInSession(req)) {
        return res.status(400).json({
          resp: 'ERROR',
          resp_message: 'CONSENT_REQUIRED',
          resp_action: [],
        });
      }
    }
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
    const signupTermsAgreed = authIntent === 'register'
      ? (parseAgreeFlag(req.body?.terms_agreed) || hasSignupConsentInSession(req) ? 1 : 0)
      : 0;
    const signupPrivacyAgreed = authIntent === 'register'
      ? (parseAgreeFlag(req.body?.privacy_agreed) || hasSignupConsentInSession(req) ? 1 : 0)
      : 0;

	const authResult = await resolveAuthUser({
	  provider,
	  login_id,
	  email,
	  user_name,
	  referralCode,
      terms_agreed: signupTermsAgreed,
      privacy_agreed: signupPrivacyAgreed,
      intent: authIntent,
	});

	if (!authResult.ok) {
      const alertByMessage = {
        'USER NOT FOUND': '가입된 계정이 없습니다. 회원가입을 먼저 진행해주세요.',
        'USER ALREADY EXISTS': '이미 가입된 계정입니다. 로그인으로 이용해주세요.',
      };
      const fallbackByStage = {
        login: '가입된 계정이 없습니다. 회원가입을 먼저 진행해주세요.',
        signup: '회원가입 처리에 실패했습니다.',
        session: '로그인 세션을 생성하지 못했습니다.',
      };
      const targetPath = getAuthEntryPathByIntent(authIntent);
      const errorMessage = String(authResult.message || '').toUpperCase();
	  return res.status(400).json({
		resp: 'ERROR',
		resp_message: authResult.message || 'ERROR',
		resp_action: [
          { type: 'alert', value: alertByMessage[errorMessage] || fallbackByStage[authResult.stage] || '인증 처리 중 오류가 발생했습니다.' },
          { type: 'redirect', value: targetPath },
        ],
	  });
	}

	delete req.session.pendingReferralCode;
    delete req.session.signupConsentAgreed;
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
    const authIntent = normalizeAuthIntent(req.session?.naverAuthIntent || req.session?.socialAuthIntent);
    const fallbackPath = getAuthEntryPathByIntent(authIntent);
    if (authIntent === 'register' && !hasSignupConsentInSession(req)) {
      return res.redirect(`${fallbackPath}?error=consent_required`);
    }
    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    const expectedState = String(req.session?.naverLoginState || '').trim();
    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect(`${fallbackPath}?error=naver_state`);
    }

    const accessToken = await exchangeNaverToken({ code, state, req });
    const profile = await fetchNaverUserProfile(accessToken);
    const login_id = String(profile.id || '').trim();
    if (!login_id) {
      return res.redirect(`${fallbackPath}?error=naver_profile`);
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
      terms_agreed: authIntent === 'register' && hasSignupConsentInSession(req) ? 1 : 0,
      privacy_agreed: authIntent === 'register' && hasSignupConsentInSession(req) ? 1 : 0,
      intent: authIntent,
    });
    if (!authResult.ok) {
      if (authResult.stage === 'login') return res.redirect(`${fallbackPath}?error=social_user_not_found`);
      if (authResult.message === 'USER ALREADY EXISTS') return res.redirect(`${fallbackPath}?error=social_user_exists`);
      return res.redirect(`${fallbackPath}?error=${authResult.stage === 'session' ? 'naver_session' : 'naver_signup'}`);
    }

    delete req.session.pendingReferralCode;
    delete req.session.signupConsentAgreed;
    delete req.session.naverLoginState;
    delete req.session.naverAuthIntent;
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
    const authIntent = normalizeAuthIntent(req.session?.naverAuthIntent || req.session?.socialAuthIntent);
    const fallbackPath = getAuthEntryPathByIntent(authIntent);
    return res.redirect(`${fallbackPath}?error=naver_auth`);
  }
};

const kakaoAuthCallback = async (req, res) => {
  try {
    const authIntent = normalizeAuthIntent(req.session?.kakaoAuthIntent || req.session?.socialAuthIntent);
    const fallbackPath = getAuthEntryPathByIntent(authIntent);
    if (authIntent === 'register' && !hasSignupConsentInSession(req)) {
      return res.redirect(`${fallbackPath}?error=consent_required`);
    }
    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    const expectedState = String(req.session?.kakaoLoginState || '').trim();
    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect(`${fallbackPath}?error=kakao_state`);
    }

    const accessToken = await exchangeKakaoToken({ code, req });
    const profile = await fetchKakaoUserProfile(accessToken);
    const login_id = String(profile?.id || '').trim();
    if (!login_id) {
      return res.redirect(`${fallbackPath}?error=kakao_profile`);
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
      terms_agreed: authIntent === 'register' && hasSignupConsentInSession(req) ? 1 : 0,
      privacy_agreed: authIntent === 'register' && hasSignupConsentInSession(req) ? 1 : 0,
      intent: authIntent,
    });
    if (!authResult.ok) {
      if (authResult.stage === 'login') return res.redirect(`${fallbackPath}?error=social_user_not_found`);
      if (authResult.message === 'USER ALREADY EXISTS') return res.redirect(`${fallbackPath}?error=social_user_exists`);
      return res.redirect(`${fallbackPath}?error=${authResult.stage === 'session' ? 'kakao_session' : 'kakao_signup'}`);
    }

    delete req.session.pendingReferralCode;
    delete req.session.signupConsentAgreed;
    delete req.session.kakaoLoginState;
    delete req.session.kakaoAuthIntent;
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
    const authIntent = normalizeAuthIntent(req.session?.kakaoAuthIntent || req.session?.socialAuthIntent);
    const fallbackPath = getAuthEntryPathByIntent(authIntent);
    const msg = String(err?.message || '');
    if (msg.startsWith('KAKAO_TOKEN_EXCHANGE_FAILED:')) {
      return res.redirect(`${fallbackPath}?error=kakao_token`);
    }
    if (msg.startsWith('KAKAO_PROFILE_FAILED:')) {
      return res.redirect(`${fallbackPath}?error=kakao_profile`);
    }
    return res.redirect(`${fallbackPath}?error=kakao_auth`);
  }
};

const appleAuthCallback = async (req, res) => {
  try {
    const state = String(req.body?.state || req.query?.state || '').trim();
    const decodedState = decodeAppleState(state);
    const authIntent = normalizeAuthIntent(
      req.session?.appleAuthIntent
      || req.session?.socialAuthIntent
      || (decodedState.valid ? decodedState.payload?.authIntent : '')
    );
    const fallbackPath = getAuthEntryPathByIntent(authIntent);
    if (authIntent === 'register' && !hasSignupConsentInSession(req)) {
      return res.redirect(`${fallbackPath}?error=consent_required`);
    }
    const code = String(req.body?.code || req.query?.code || '').trim();
    const expectedState = String(req.session?.appleLoginState || '').trim();
    console.info('[APPLE CALLBACK RECEIVED]', {
      ...getAppleDebugContext(req),
      has_code: !!code,
      has_state: !!state,
      has_expected_state: !!expectedState,
      decoded_state_valid: !!decodedState.valid,
      decoded_state_reason: decodedState.valid ? 'OK' : decodedState.reason,
      auth_intent: authIntent,
    });
    const sessionStateMatched = !!(expectedState && state && state === expectedState);
    const stateValidated = sessionStateMatched || !!decodedState.valid;
    if (!code || !state || !stateValidated) {
      console.warn('[APPLE STATE MISMATCH]', {
        has_code: !!code,
        has_state: !!state,
        state_prefix: state.slice(0, 8),
        expected_prefix: expectedState.slice(0, 8),
        state_validated: stateValidated,
        decoded_state_reason: decodedState.valid ? 'OK' : decodedState.reason,
      });
      return res.redirect(`${fallbackPath}?error=apple_state`);
    }

    const tokenData = await exchangeAppleToken({ code, req });
    const idTokenPayload = parseJwtPayload(tokenData.id_token);
    const login_id = String(idTokenPayload?.sub || '').trim();
    if (!login_id) {
      return res.redirect(`${fallbackPath}?error=apple_profile`);
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
      terms_agreed: authIntent === 'register' && hasSignupConsentInSession(req) ? 1 : 0,
      privacy_agreed: authIntent === 'register' && hasSignupConsentInSession(req) ? 1 : 0,
      intent: authIntent,
    });
    if (!authResult.ok) {
      if (authResult.stage === 'login') return res.redirect(`${fallbackPath}?error=social_user_not_found`);
      if (authResult.message === 'USER ALREADY EXISTS') return res.redirect(`${fallbackPath}?error=social_user_exists`);
      return res.redirect(`${fallbackPath}?error=${authResult.stage === 'session' ? 'apple_session' : 'apple_signup'}`);
    }

    delete req.session.pendingReferralCode;
    delete req.session.signupConsentAgreed;
    delete req.session.appleLoginState;
    delete req.session.appleAuthIntent;
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
    console.error('[APPLE AUTH ERROR CONTEXT]', getAppleDebugContext(req));
    const authIntent = normalizeAuthIntent(req.session?.appleAuthIntent || req.session?.socialAuthIntent);
    const fallbackPath = getAuthEntryPathByIntent(authIntent);
    const msg = String(err?.message || '');
    if (msg.startsWith('APPLE_TOKEN_EXCHANGE_FAILED:')) {
      return res.redirect(`${fallbackPath}?error=apple_token`);
    }
    return res.redirect(`${fallbackPath}?error=apple_auth`);
  }
};

const emailRegister = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const user_name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    const passwordConfirm = String(req.body?.password_confirm || '');

    if (!email || !user_name || !password || !passwordConfirm) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'REQUIRED_VALUES_MISSING', resp_action: [] });
    }
    if (!isValidEmailFormat(email)) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'INVALID_EMAIL_FORMAT', resp_action: [] });
    }
    if (password.length < 8) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'WEAK_PASSWORD', resp_action: [] });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'PASSWORD_MISMATCH', resp_action: [] });
    }
    const termsAgreed = parseAgreeFlag(req.body?.terms_agreed);
    const privacyAgreed = parseAgreeFlag(req.body?.privacy_agreed);
    if (!(termsAgreed && privacyAgreed)) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'CONSENT_REQUIRED', resp_action: [] });
    }

    const provider = 'EMAIL';
    const login_id = email;
    const referralCode = normalizeReferralCode(req.session?.pendingReferralCode || req.body?.referral_code);
    const passwordHash = createSaltedPasswordHash(password);

    const authResult = await resolveAuthUser({
      provider,
      login_id,
      email,
      user_name,
      user_pass: passwordHash,
      terms_agreed: termsAgreed ? 1 : 0,
      privacy_agreed: privacyAgreed ? 1 : 0,
      referralCode,
      intent: 'register',
    });

    if (!authResult.ok) {
      const message = String(authResult.message || '').toUpperCase();
      if (message.includes('ALREADY EXISTS')) {
        return res.status(400).json({ resp: 'ERROR', resp_message: 'USER_ALREADY_EXISTS', resp_action: [] });
      }
      return res.status(400).json({ resp: 'ERROR', resp_message: 'EMAIL_SIGNUP_FAILED', resp_action: [] });
    }

    delete req.session.pendingReferralCode;
    delete req.session.signupConsentAgreed;
    await setUserSession(req, authResult.row);
    req.session.welcomeContext = {
      isNewSignup: true,
      referralApplied: !!authResult.referralApplied,
    };
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.json({
      resp: 'OK',
      resp_message: 'OK',
      resp_action: [{ type: 'redirect', value: '/user/welcome' }],
    });
  } catch (err) {
    console.error('[EMAIL REGISTER ERROR]', err);
    return res.status(500).json({ resp: 'ERROR', resp_message: 'EMAIL_SIGNUP_FAILED', resp_action: [] });
  }
};

const emailLogin = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'REQUIRED_VALUES_MISSING', resp_action: [] });
    }
    if (!isValidEmailFormat(email)) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'INVALID_EMAIL_FORMAT', resp_action: [] });
    }

    const provider = 'EMAIL';
    const login_id = email;
    const sessionRow = await loadUserSessionRow(provider, login_id);
    const sessionResp = String(sessionRow.resp || 'ERROR').toUpperCase();
    if (sessionResp !== 'OK') {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'USER_NOT_FOUND', resp_action: [] });
    }

    const savedPasswordHash = await loadEmailPasswordHash(login_id);
    if (!savedPasswordHash) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'INVALID_PASSWORD', resp_action: [] });
    }
    if (!verifyPasswordHash(password, savedPasswordHash)) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'INVALID_PASSWORD', resp_action: [] });
    }

    await setUserSession(req, sessionRow);
    delete req.session.welcomeContext;
    delete req.session.pendingReferralCode;
    return res.json({
      resp: 'OK',
      resp_message: 'OK',
      resp_action: [{ type: 'redirect', value: '/user/mypage' }],
    });
  } catch (err) {
    console.error('[EMAIL LOGIN ERROR]', err);
    return res.status(500).json({ resp: 'ERROR', resp_message: 'EMAIL_LOGIN_FAILED', resp_action: [] });
  }
};

const signupConsent = async (req, res) => {
  try {
    const termsAgreed = parseAgreeFlag(req.body?.terms_agreed);
    const privacyAgreed = parseAgreeFlag(req.body?.privacy_agreed);
    req.session.signupConsentAgreed = !!(termsAgreed && privacyAgreed);
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.json({
      resp: req.session.signupConsentAgreed ? 'OK' : 'ERROR',
      resp_message: req.session.signupConsentAgreed ? 'OK' : 'CONSENT_REQUIRED',
      resp_action: [],
    });
  } catch (err) {
    console.error('[SIGNUP CONSENT ERROR]', err);
    return res.status(500).json({ resp: 'ERROR', resp_message: 'CONSENT_SAVE_FAILED', resp_action: [] });
  }
};

const getNaverLoginUrl = (req, intent = 'login') => {
  const clientId = String(process.env.NAVER_LOGIN_CLIENT_ID || '').trim();
  if (!clientId) return '';
  const state = randomState();
  req.session.naverAuthIntent = normalizeAuthIntent(intent);
  req.session.naverLoginState = state;
  return buildNaverAuthorizeUrl(req, state);
};

const getKakaoLoginUrl = (req, intent = 'login') => {
  const clientId = String(process.env.KAKAO_LOGIN_REST_API_KEY || '').trim();
  if (!clientId) return '';
  const state = randomState();
  req.session.kakaoAuthIntent = normalizeAuthIntent(intent);
  req.session.kakaoLoginState = state;
  return buildKakaoAuthorizeUrl(req, state);
};

const getAppleLoginUrl = (req, intent = 'login') => {
  const clientId = String(process.env.APPLE_LOGIN_CLIENT_ID || '').trim();
  if (!clientId) return '';
  const authIntent = normalizeAuthIntent(intent);
  const state = createAppleState(authIntent);
  req.session.appleAuthIntent = authIntent;
  req.session.appleLoginState = state;
  console.info('[APPLE LOGIN URL CREATED]', {
    ...getAppleDebugContext(req),
    auth_intent: req.session.appleAuthIntent,
    state_prefix: state.slice(0, 8),
  });
  return buildAppleAuthorizeUrl(req, state);
};

module.exports = {
  googleAuth,
  naverAuthCallback,
  kakaoAuthCallback,
  appleAuthCallback,
  emailRegister,
  emailLogin,
  signupConsent,
  getNaverLoginUrl,
  getKakaoLoginUrl,
  getAppleLoginUrl,
  buildNaverCallbackUrl,
  buildKakaoCallbackUrl,
  buildAppleCallbackUrl,
};
