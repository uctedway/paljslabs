require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const sass = require('sass');
const fs = require('fs');
const session = require('express-session');
const { createClient } = require('redis');
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

// ============================================
// SASS 컴파일 함수
// ============================================
const compileSass = () => {
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
app.use(
  session({
    name: '48lab.sid', // 쿠키 이름 (원하시면 프로젝트명에 맞게)
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: redisStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // 운영 HTTPS에서만 true
      sameSite: 'lax', // 보통 웹서비스는 lax가 무난
      maxAge: 1000 * 60 * 60 * 2, // 2시간
    },
  })
);
app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.user = req.session ? req.session.user : null;
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

app.use('/', homeRoutes);
app.use('/user', userRoutes);
app.use('/api', apiRoutes);
app.use('/saju', sajuRoutes);
app.use('/fortune', fortuneRoutes);

// ============================================
// Error handling
// ============================================
app.use((req, res, next) => {
    res.status(404).send('페이지를 찾을 수 없습니다.');
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
