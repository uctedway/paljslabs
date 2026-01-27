require('dotenv').config();  // 이 줄 추가

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Routes
// ============================================
const homeRoutes = require('./apps/home/routes/home');
const userRoutes = require('./apps/user/routes/user');
const apiRoutes = require('./apps/api/routes/api');

app.use('/', homeRoutes);
app.use('/user', userRoutes);
app.use('/api', apiRoutes);

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
