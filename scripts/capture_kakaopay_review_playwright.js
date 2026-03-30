const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseURL = 'http://localhost:3000';
const screenshotDir = path.join(__dirname, '..', 'public', 'review', 'screenshots');

async function shot(page, filename, url, waitForSelector) {
  await page.goto(`${baseURL}${url}`, { waitUntil: 'domcontentloaded' });
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector);
  }
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(screenshotDir, filename),
    fullPage: true,
  });
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

  await shot(page, '01-email-register.png', '/user/email-register', 'h1');

  await page.goto(`${baseURL}/user/email-login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await page.fill('#email-login-id', 'dev@48lab.co.kr');
  await page.fill('#email-login-password', 'Review2026!');
  await page.screenshot({
    path: path.join(screenshotDir, '02-email-login.png'),
    fullPage: true,
  });
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
    if (!res.ok) {
      throw new Error(`LOGIN_FAILED_${res.status}`);
    }
  });
  await page.goto(`${baseURL}/user/mypage`, { waitUntil: 'domcontentloaded' });

  await shot(page, '03-billing-review.png', '/user/billing/review', '.billing-label');
  await shot(page, '04-review-checkout.png', '/user/billing/review/checkout?amount_krw=10000', 'h3');
  await shot(page, '05-review-gateway.png', '/user/billing/review/gateway?amount_krw=10000', 'h2');

  await page.goto(`${baseURL}/user/billing/review/complete`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/user/billing/success**', { timeout: 10000 });
  await page.waitForSelector('h2');
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(screenshotDir, '06-billing-success.png'),
    fullPage: true,
  });

  await shot(page, '07-purchase-history.png', '/user/purchase-history', 'h2');
  await shot(page, '08-token-usage-history.png', '/user/token-usage-history', 'h2');
  await shot(page, '09-terms.png', '/terms', 'h1');

  await browser.close();
  console.log(`Saved screenshots to ${screenshotDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
