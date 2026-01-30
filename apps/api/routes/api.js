const express = require('express');
const router = express.Router();
//const apiController = require('../controllers/index');
router.get('/', require('../controllers/index').index);
router.post('/saju/fortune', require('../controllers/saju_fortune').getSajuFortune);
router.get('/saju/test', require('../controllers/saju_fortune').claudeTest);

module.exports = router;
