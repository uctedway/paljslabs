const path = require('path');

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

module.exports = {
    index,
    ping,
    terms,
    privacyPolicy
};
