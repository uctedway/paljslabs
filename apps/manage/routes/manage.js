const express = require('express');
const controller = require('../controllers/index');
const { requireManageAuth, requireManageGuest } = require('../middlewares/manage_auth');

const router = express.Router();

router.get('/login', requireManageGuest, controller.loginPage);
router.post('/login', requireManageGuest, controller.login);
router.post('/logout', requireManageAuth, controller.logout);
router.get('/', requireManageAuth, controller.dashboard);
router.get('/monitoring/calls', requireManageAuth, controller.callMonitoringPage);
router.get('/monitoring/tokens', requireManageAuth, controller.tokenMonitoringPage);
router.get('/users', requireManageAuth, controller.usersPage);
router.get('/prompts', requireManageAuth, controller.promptsPage);
router.post('/prompts', requireManageAuth, controller.savePrompt);
router.get('/users/:loginId/detail', requireManageAuth, controller.userDetailApi);
router.post('/users/:loginId/grant-token', requireManageAuth, controller.grantUserTokenApi);
router.get('/info', requireManageAuth, controller.infoPage);
router.post('/info', requireManageAuth, controller.updateInfo);
router.get('/password', requireManageAuth, controller.passwordPage);
router.post('/password', requireManageAuth, controller.changePassword);

module.exports = router;
