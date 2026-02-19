const express = require('express');
const router = express.Router();

const indexController = require('../controllers/index');
const sajuController = require('../controllers/saju');
const paymentController = require('../controllers/payment');
const fortuneController = require('../controllers/fortune');
const analysisController = require('../controllers/analysis');

router.get('/', indexController.index);

router.post('/saju/request', sajuController.createSajuFortuneRequest);
router.post('/saju/target/save', sajuController.saveTargetInfoFromRequest);
router.get('/saju/request/:resultId/status', sajuController.getSajuFortuneStatus);
router.post('/saju/request/:resultId/share', sajuController.createSajuShareLink);
router.post('/saju/request/:resultId/save-target', sajuController.saveResultTargetInfo);
router.get('/saju/test', sajuController.claudeTest);

router.post('/fortune/:feature/request', fortuneController.createFortuneRequest);
router.get('/fortune/:feature/request/:resultId/status', fortuneController.getFortuneStatus);
router.get('/analysis/current-status', analysisController.getCurrentStatus);

router.get('/tokens/summary', paymentController.getTokenSummary);
router.post('/tokens/grant-event', paymentController.grantEventToken);

router.post('/payments/request', paymentController.createPayment);
router.post('/payments/confirm', paymentController.confirmPayment);
router.post('/payments/fail', paymentController.failPayment);
router.post('/payments/cancel', paymentController.cancelPayment);

router.get('/payments/callback/:provider', paymentController.providerCallbackSuccess);
router.get('/payments/callback/:provider/cancel', paymentController.providerCallbackCancel);
router.get('/payments/callback/:provider/fail', paymentController.providerCallbackFail);

module.exports = router;
