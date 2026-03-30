const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseURL = 'http://localhost:3000';
const screenshotDir = path.join(__dirname, '..', 'public', 'review', 'screenshots');

async function shot(page, filename, url, waitForSelector) {
  await page.goto(`${baseURL}${url}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    localStorage.setItem('beta_notice_hide_date', `${yyyy}-${mm}-${dd}`);
    localStorage.setItem('theme.mode', 'light');
    const modal = document.getElementById('betaNoticeModal');
    if (modal) modal.remove();
    document.body.classList.remove('beta-notice-open');
  });
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector);
  }
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(screenshotDir, filename),
    fullPage: true,
  });
}

async function login(page) {
  await page.goto(`${baseURL}/user/email-login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await page.evaluate(async () => {
    const body = new URLSearchParams();
    body.set('email', 'dev@48lab.co.kr');
    body.set('password', 'Review2026!');
    const res = await fetch('/user/email-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`LOGIN_FAILED_${res.status}`);
  });
  await page.goto(`${baseURL}/user/mypage`, { waitUntil: 'domcontentloaded' });
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1400 },
    locale: 'ko-KR',
  });
  await context.addInitScript(() => {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    localStorage.setItem('beta_notice_hide_date', `${yyyy}-${mm}-${dd}`);
    localStorage.setItem('theme.mode', 'light');
  });

  const page = await context.newPage();
  await login(page);

  await shot(page, '05-review-gateway.png', '/user/billing/review/gateway?amount_krw=10000', 'article h2');
  await shot(page, '06-billing-success.png', '/user/billing/success?payment_id=15', '.billing-result-card h2');
  await shot(page, '07-purchase-history.png', '/user/purchase-history', '.data-grid-head h2');
  await shot(page, '08-token-usage-history.png', '/user/token-usage-history', '.data-grid-head h2');
  await shot(page, '09-terms.png', '/terms', '.legal-header h1');

  await browser.close();
  console.log(`Saved tail screenshots to ${screenshotDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
