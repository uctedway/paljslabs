require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { createClient } = require('redis');
const { buildSeo } = require('./apps/core/utils/seo');
const { resolveLocale, t, buildLangUrl, ogLocaleByLocale, normalizeLocale, stripLocalePrefix } = require('./apps/core/utils/i18n');
let sass = null;
try {
  // Render production 배포에서는 devDependencies가 설치되지 않을 수 있습니다.
  sass = require('sass');
} catch (err) {
  sass = null;
}
//const RedisStore = require('connect-redis').default;
// const ConnectRedis = require('connect-redis');
// const RedisStore = ConnectRedis.default ?? ConnectRedis;
const connectRedis = require('connect-redis');

// connect-redis 버전별 호환 처리
let RedisStoreCtor;
if (typeof connectRedis === 'function' && !connectRedis.create && !connectRedis.RedisStore) {
  // 구버전: connect-redis(session) 형태
  RedisStoreCtor = connectRedis(session);
} else {
  // 신버전: default / RedisStore / module 자체
  RedisStoreCtor = connectRedis.default ?? connectRedis.RedisStore ?? connectRedis;
}
const app = express();
const PORT = process.env.PORT || 3000;
const APP_START_TS = Date.now();

function buildDisplayLabel() {
  const explicit = String(process.env.BUILD_NUMBER || '').trim();
  if (explicit) return `b${explicit}`;
  const renderCommit = String(process.env.RENDER_GIT_COMMIT || '').trim();
  if (renderCommit) return `b${renderCommit.slice(0, 7)}`;
  return `b${APP_START_TS}`;
}

const BUILD_LABEL = buildDisplayLabel();

// ============================================
// SASS 컴파일 함수
// ============================================
const compileSass = () => {
    if (!sass) {
        console.log('SASS module not found, skip compile and use prebuilt CSS');
        return;
    }
    const scssPath = path.join(__dirname, 'public', 'scss', 'style.scss');
    const cssPath = path.join(__dirname, 'public', 'css', 'style.css');
    
    try {
        const result = sass.compile(scssPath, {
            silenceDeprecations: ['import']
        });
        fs.writeFileSync(cssPath, result.css);
        console.log('SASS compiled successfully');
    } catch (error) {
        console.error('SASS compile error:', error);
    }
};

// 시작 시 SASS 컴파일
compileSass();

// ============================================
// EJS 설정
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'apps'));
app.set('layout', 'core/pages/base');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);
app.use(expressLayouts);

// ============================================
// Middleware
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Locale URL policy:
// - Korean default: /path
// - English: /en/path
// - Legacy ?lang=xx is redirected to canonical locale path.
app.use((req, res, next) => {
  const originalPath = String(req.path || '/');
  const split = stripLocalePrefix(originalPath);
  if (split.localeFromPath === 'en') {
    req._forcedLocale = 'en';
    const suffix = req.url.slice(originalPath.length);
    req.url = `${split.pathname}${suffix}`;
  } else {
    req._forcedLocale = '';
  }
  next();
});

// 요청마다 SASS를 컴파일하면 응답 지연이 커질 수 있어 제거합니다.
// 개발 중 실시간 반영은 `npm run sass` 워치 모드를 사용합니다.

//세션관련
// ============================================
// Session (Redis)
// ============================================
if (process.env.NODE_ENV === 'production') {
  // Render 같은 프록시/로드밸런서 환경 대비
  app.set('trust proxy', 1);
}

// Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.connect().then(() => {
  console.log('Redis connected');
}).catch((err) => {
  console.error('Redis connect failed:', err);
});

// Redis session store
// const redisStore = RedisStore.create({
  // client: redisClient,
  // prefix: 'sess:',
// });
const redisStore = (typeof RedisStoreCtor.create === 'function')
  ? RedisStoreCtor.create({ client: redisClient, prefix: 'sess:' })
  : new RedisStoreCtor({ client: redisClient, prefix: 'sess:' });
  
// Session middleware
const isProd = process.env.NODE_ENV === 'production';
app.use(
  session({
    name: '48lab.sid', // 쿠키 이름 (원하시면 프로젝트명에 맞게)
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: redisStore,
    proxy: isProd,
    cookie: {
      httpOnly: true,
      // Apple Sign In(form_post) 콜백은 cross-site POST라서 운영에서는 None+Secure가 필요합니다.
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 2, // 2시간
    },
  })
);
app.use((req, res, next) => {
  const isManagePath = String(req.path || '').startsWith('/manage');
  const isApiPath = String(req.path || '').startsWith('/api') || String(req.path || '').startsWith('/_session');
  const method = String(req.method || 'GET').toUpperCase();
  const queryLang = normalizeLocale(req.query?.lang);
  const locale = resolveLocale(req, { skipSession: isManagePath });
  req.locale = locale;
  const originalPath = String(req.originalUrl || '').split('?')[0] || '/';
  const isStaticAsset = /\.[a-z0-9]+$/i.test(String(req.path || ''));
  if (!isManagePath && !isApiPath && !isStaticAsset && (method === 'GET' || method === 'HEAD')) {
    if (queryLang) {
      const qs = new URLSearchParams(req.query || {});
      qs.delete('lang');
      const suffixQs = qs.toString();
      const targetBase = locale === 'en'
        ? (req.path === '/' ? '/en' : `/en${req.path}`)
        : req.path;
      const targetWithQs = suffixQs ? `${targetBase}?${suffixQs}` : targetBase;
      return res.redirect(302, targetWithQs);
    }
    if (locale === 'en' && !(originalPath === '/en' || originalPath.startsWith('/en/'))) {
      return res.redirect(302, buildLangUrl(req, 'en'));
    }
  }
  res.locals.session = req.session;
  res.locals.user = req.session ? req.session.user : null;
  res.locals.manageAdmin = req.session ? req.session.manageAdmin : null;
  res.locals.buildLabel = BUILD_LABEL;
  res.locals.locale = locale;
  res.locals.isEn = locale === 'en';
  res.locals.tt = (ko, en) => (locale === 'en' ? String(en ?? ko ?? '') : String(ko ?? ''));
  res.locals.ogLocale = ogLocaleByLocale(locale);
  res.locals.t = (key, params) => t(locale, key, params);
  res.locals.currentPath = String(req.path || '/');
  res.locals.langUrls = isManagePath
    ? null
    : {
      ko: buildLangUrl(req, 'ko'),
      en: buildLangUrl(req, 'en'),
    };
  const seoMeta = buildSeo(req);
  res.locals.seo = seoMeta;
  if (seoMeta.noindex) {
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  } else {
    res.set('X-Robots-Tag', 'index, follow');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Routes
// ============================================
// 세션 디버그 라우트는 운영 환경에서 노출되지 않도록 제한합니다.
if (process.env.NODE_ENV !== 'production') {
  app.get('/_session/set', (req, res) => {
    req.session.user = { id: 'test', at: Date.now() };
    res.send('OK');
  });

  app.get('/_session/get', (req, res) => {
    res.json({ session: req.session });
  });
}
const homeRoutes = require('./apps/home/routes/home');
const userRoutes = require('./apps/user/routes/user');
const apiRoutes = require('./apps/api/routes/api');
const sajuRoutes = require('./apps/saju/route');
const fortuneRoutes = require('./apps/fortune/route');
const manageRoutes = require('./apps/manage/routes/manage');

app.use('/', homeRoutes);
app.use('/user', userRoutes);
app.use('/api', apiRoutes);
app.use('/saju', sajuRoutes);
app.use('/fortune', fortuneRoutes);
app.use('/manage', manageRoutes);

// ============================================
// Error handling
// ============================================
app.use((req, res, next) => {
    const isEn = String(res.locals?.locale || '').toLowerCase() === 'en';
    res.status(404).render('home/pages/not_found', {
      title: isEn ? '404 - Page Not Found' : '404 - 페이지를 찾을 수 없습니다',
      seo: buildSeo(req, {
        title: isEn ? '404 - Page Not Found | 48LAB' : '404 - 페이지를 찾을 수 없습니다 | 48LAB',
        description: isEn
          ? 'The requested page could not be found. Please navigate again from 48LAB home.'
          : '요청하신 페이지를 찾을 수 없습니다. 48LAB 홈에서 다시 탐색해 주세요.',
        noindex: true,
      }),
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send(`<pre>${err.stack}</pre>`);
});

// ============================================
// Server start
// ============================================
app.listen(PORT, () => {
    console.log('========================================');
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('========================================');
});
