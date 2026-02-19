const express = require('express');
const router = express.Router();
const fortuneController = require('./controller');

router.get('/', fortuneController.index);
router.get('/result/:resultId', fortuneController.resultPage);
router.get('/:feature', fortuneController.featurePage);

module.exports = router;
