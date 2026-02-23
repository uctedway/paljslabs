const express = require('express');
const router = express.Router();
const indexController = require('../controllers/index');

// GET /
router.get('/', indexController.index);
router.get('/ping', indexController.ping);
router.get('/robots.txt', indexController.robotsTxt);
router.get('/sitemap.xml', indexController.sitemapXml);
router.get('/sitemap-ko.xml', indexController.sitemapKoXml);
router.get('/sitemap-en.xml', indexController.sitemapEnXml);
router.get('/terms', indexController.terms);
router.get('/privacy-policy', indexController.privacyPolicy);
router.get('/system-maintenance', indexController.systemMaintenance);

module.exports = router;
