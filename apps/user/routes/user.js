const express = require('express');
const router = express.Router();
const indexController = require('../controllers/index');
const authController = require('../controllers/auth');
const mypageController = require('../controllers/mypage');

router.get('/', indexController.index);

router.get('/login', indexController.login);
router.get('/email-login', indexController.emailLogin);
router.get('/invite/:code', indexController.inviteEntry);
router.get('/logout', indexController.logout);
router.post('/auth/google', authController.googleAuth);
router.post('/auth/signup-consent', authController.signupConsent);
router.post('/email-register', authController.emailRegister);
router.post('/email-login', authController.emailLogin);
router.get('/auth/naver/callback', authController.naverAuthCallback);
router.get('/auth/kakao/callback', authController.kakaoAuthCallback);
router.get('/auth/apple/callback', authController.appleAuthCallback);
router.post('/auth/apple/callback', authController.appleAuthCallback);

router.get('/register', indexController.register);
router.get('/email-register', indexController.emailRegister);
router.get('/welcome', indexController.welcome);
router.get('/mypage', mypageController.index);
router.get('/mypage/profile', mypageController.profilePage);
router.get('/mypage/relatives', mypageController.relativesPage);
router.get('/mypage/history', mypageController.historyPage);
router.get('/mypage/history/:resultId', mypageController.historyDetail);
router.get('/mypage/withdraw', mypageController.withdrawPage);
router.get('/billing', indexController.billing);
router.get('/purchase-history', indexController.purchaseHistory);
router.get('/token-usage-history', indexController.tokenUsageHistory);
router.get('/billing/success', indexController.billingSuccess);
router.get('/billing/canceled', indexController.billingCanceled);
router.get('/billing/failed', indexController.billingFailed);

router.post('/mypage/profile/update', mypageController.updateProfile);
router.post('/mypage/relatives/create', mypageController.createRelative);
router.post('/mypage/relatives/update', mypageController.updateRelative);
router.post('/mypage/relatives/delete', mypageController.deleteRelative);
router.post('/mypage/withdraw', mypageController.withdrawAccount);

module.exports = router;
