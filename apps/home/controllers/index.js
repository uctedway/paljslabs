const path = require('path');
const { getSiteOrigin } = require('../../core/utils/seo');

/**
 * 홈 인덱스 페이지
 */
const index = (req, res) => {
    res.render(path.join(__dirname, '../pages/index.ejs'));
};
const ping = (req, res) => {
    res.send('48lab');
};
const terms = (req, res) => {
    res.render(path.join(__dirname, '../pages/terms.ejs'), {
        title: '48LAB 이용약관',
        effectiveDate: '2026-02-19',
    });
};
const privacyPolicy = (req, res) => {
    res.render(path.join(__dirname, '../pages/privacy_policy.ejs'), {
        title: '48LAB 개인정보처리방침',
        effectiveDate: '2026-02-19',
    });
};
const systemMaintenance = (req, res) => {
    res.render(path.join(__dirname, '../pages/system_maintenance.ejs'), {
        title: '48LAB 시스템 점검 안내',
    });
};

const robotsTxt = (req, res) => {
    const origin = getSiteOrigin(req);
    const body = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /manage/',
        'Disallow: /user/',
        'Disallow: /en/api/',
        'Disallow: /en/manage/',
        'Disallow: /en/user/',
        'Disallow: /saju/result/',
        'Disallow: /saju/shared/',
        'Disallow: /fortune/result/',
        'Disallow: /en/saju/result/',
        'Disallow: /en/saju/shared/',
        'Disallow: /en/fortune/result/',
        `Sitemap: ${origin}/sitemap.xml`,
        '',
    ].join('\n');
    res.type('text/plain; charset=utf-8').send(body);
};

function buildSitemapUrlset(origin, locale = 'ko') {
    const today = new Date().toISOString().slice(0, 10);
    const basePaths = [
        '/',
        '/saju',
        '/fortune',
        '/fortune/compatibility',
        '/fortune/today',
        '/fortune/flow',
        '/fortune/naming',
        '/fortune/date-selection',
        '/terms',
        '/privacy-policy',
    ];
    const toPath = (path, loc) => (loc === 'en' ? (path === '/' ? '/en' : `/en${path}`) : path);
    const canonical = (path, loc) => `${origin}${toPath(path, loc)}`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${basePaths
        .map((p) => `  <url><loc>${canonical(p, locale)}</loc><xhtml:link rel="alternate" hreflang="ko-KR" href="${canonical(p, 'ko')}"/><xhtml:link rel="alternate" hreflang="en-US" href="${canonical(p, 'en')}"/><xhtml:link rel="alternate" hreflang="x-default" href="${canonical(p, 'ko')}"/><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${p === '/' ? '1.0' : '0.8'}</priority></url>`)
        .join('\n')}\n</urlset>\n`;
}

const sitemapXml = (req, res) => {
    const origin = getSiteOrigin(req);
    const today = new Date().toISOString().slice(0, 10);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${origin}/sitemap-ko.xml</loc><lastmod>${today}</lastmod></sitemap>\n  <sitemap><loc>${origin}/sitemap-en.xml</loc><lastmod>${today}</lastmod></sitemap>\n</sitemapindex>\n`;
    res.type('application/xml; charset=utf-8').send(xml);
};

const sitemapKoXml = (req, res) => {
    const origin = getSiteOrigin(req);
    const xml = buildSitemapUrlset(origin, 'ko');
    res.type('application/xml; charset=utf-8').send(xml);
};

const sitemapEnXml = (req, res) => {
    const origin = getSiteOrigin(req);
    const xml = buildSitemapUrlset(origin, 'en');
    res.type('application/xml; charset=utf-8').send(xml);
};

module.exports = {
    index,
    ping,
    terms,
    privacyPolicy,
    systemMaintenance,
    robotsTxt,
    sitemapXml,
    sitemapKoXml,
    sitemapEnXml,
};
