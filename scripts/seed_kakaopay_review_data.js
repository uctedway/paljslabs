require('dotenv').config();

const crypto = require('crypto');
const db = require('../apps/core/utils/db');
const { createPaymentRequest, confirmPaymentSuccess, markPaymentCanceled } = require('../apps/api/services/payment_store');
const { consumeToken } = require('../apps/api/services/token_wallet');

const REVIEW_EMAIL = 'dev@48lab.co.kr';
const REVIEW_NAME = '테스터';
const REVIEW_PASSWORD = 'Review2026!';

function convertQ(v) {
  return db.convertQ(v == null ? '' : String(v));
}

function createSaltedPasswordHash(rawPassword) {
  const password = String(rawPassword || '');
  const iterations = 120000;
  const keylen = 32;
  const digest = 'sha256';
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
  return `pbkdf2$${iterations}$${salt}$${derivedKey}`;
}

async function ensureReviewUser() {
  const passwordHash = createSaltedPasswordHash(REVIEW_PASSWORD);
  const query = `
    EXEC dbo.PJ_USP_CREATE_USERS
      @provider = 'EMAIL',
      @login_id = '${convertQ(REVIEW_EMAIL)}',
      @email = '${convertQ(REVIEW_EMAIL)}',
      @user_pass = '${convertQ(passwordHash)}',
      @terms_agreed = 1,
      @privacy_agreed = 1,
      @user_name = N'${convertQ(REVIEW_NAME)}',
      @referral_code = ''
  `;
  const rs = await db.query(query);
  const row = rs?.[0] || {};
  const message = String(row.resp_message || '').toUpperCase();
  if (String(row.resp || '').toUpperCase() !== 'OK' && !message.includes('ALREADY EXISTS')) {
    throw new Error(`FAILED_TO_CREATE_USER: ${row.resp_message || 'UNKNOWN'}`);
  }

  const updateQuery = `
    UPDATE dbo.PJ_TB_USERS
    SET
      email = '${convertQ(REVIEW_EMAIL)}',
      user_name = N'${convertQ(REVIEW_NAME)}',
      user_pass = '${convertQ(passwordHash)}',
      terms_agreed = 1,
      privacy_agreed = 1,
      policy_agreed_at = ISNULL(policy_agreed_at, SYSDATETIME()),
      updated_at = SYSDATETIME()
    WHERE login_id = '${convertQ(REVIEW_EMAIL)}'
  `;
  await db.query(updateQuery);
}

async function clearExistingReviewData() {
  const loginId = convertQ(REVIEW_EMAIL);
  await db.query(`
    DELETE FROM dbo.PJ_TB_TOKEN_LEDGER WHERE login_id = '${loginId}';
    DELETE FROM dbo.PJ_TB_PAYMENTS WHERE login_id = '${loginId}';
    UPDATE dbo.PJ_TB_USERS
    SET token_balance = 0, updated_at = SYSDATETIME()
    WHERE login_id = '${loginId}';
  `);
}

async function createSuccessfulPayment({ amountKrw, tokenAmount, requestedAt, approvedAt, merchantRef }) {
  const created = await createPaymentRequest({
    loginId: REVIEW_EMAIL,
    provider: 'KAKAOPAY',
    amountKrw,
    tokenAmount,
    requestPayload: {
      merchant_order_id: merchantRef,
      review_seed: true,
    },
  });

  const paymentId = Number(created.payment_id || 0);
  if (!paymentId) {
    throw new Error(`FAILED_TO_CREATE_PAYMENT_REQUEST: ${amountKrw}`);
  }

  const confirmed = await confirmPaymentSuccess({
    paymentId,
    providerTxnId: `MOCK-KAKAO-${paymentId}`,
    approvedPayload: {
      aid: `AID-${paymentId}`,
      tid: `TID-${paymentId}`,
      review_seed: true,
    },
  });

  if (String(confirmed.resp || '').toUpperCase() !== 'OK') {
    throw new Error(`FAILED_TO_CONFIRM_PAYMENT: ${confirmed.resp_message || paymentId}`);
  }

  await db.query(`
    UPDATE dbo.PJ_TB_PAYMENTS
    SET
      requested_at = '${convertQ(requestedAt)}',
      approved_at = '${convertQ(approvedAt)}',
      updated_at = '${convertQ(approvedAt)}'
    WHERE payment_id = ${paymentId};

    UPDATE dbo.PJ_TB_TOKEN_LEDGER
    SET created_at = '${convertQ(approvedAt)}', memo = N'카카오페이 심사용 토큰 충전'
    WHERE payment_id = ${paymentId} AND entry_type = 'PAYMENT';
  `);

  return paymentId;
}

async function createCanceledPayment({ amountKrw, tokenAmount, requestedAt, canceledAt, merchantRef }) {
  const created = await createPaymentRequest({
    loginId: REVIEW_EMAIL,
    provider: 'KAKAOPAY',
    amountKrw,
    tokenAmount,
    requestPayload: {
      merchant_order_id: merchantRef,
      review_seed: true,
    },
  });

  const paymentId = Number(created.payment_id || 0);
  if (!paymentId) {
    throw new Error(`FAILED_TO_CREATE_CANCELED_PAYMENT: ${amountKrw}`);
  }

  const canceled = await markPaymentCanceled({
    paymentId,
    providerTxnId: `MOCK-CANCEL-${paymentId}`,
    memo: '심사용 취소 케이스',
    canceledPayload: { review_seed: true },
  });

  if (String(canceled.resp || '').toUpperCase() !== 'OK') {
    throw new Error(`FAILED_TO_CANCEL_PAYMENT: ${canceled.resp_message || paymentId}`);
  }

  await db.query(`
    UPDATE dbo.PJ_TB_PAYMENTS
    SET
      requested_at = '${convertQ(requestedAt)}',
      canceled_at = '${convertQ(canceledAt)}',
      updated_at = '${convertQ(canceledAt)}'
    WHERE payment_id = ${paymentId};
  `);

  return paymentId;
}

async function createUsageEntry({ amount, usageCode, referenceType, referenceId, memo, createdAt }) {
  const row = await consumeToken({
    loginId: REVIEW_EMAIL,
    amount,
    usageCode,
    referenceType,
    referenceId,
    memo,
  });
  if (String(row.resp || '').toUpperCase() !== 'OK') {
    throw new Error(`FAILED_TO_CONSUME_TOKEN: ${row.resp_message || usageCode}`);
  }

  await db.query(`
    ;WITH latest_usage AS (
      SELECT TOP (1) ledger_id
      FROM dbo.PJ_TB_TOKEN_LEDGER
      WHERE login_id = '${convertQ(REVIEW_EMAIL)}'
        AND entry_type = 'USAGE'
        AND usage_code = '${convertQ(usageCode)}'
        AND reference_id = '${convertQ(referenceId)}'
      ORDER BY ledger_id DESC
    )
    UPDATE dbo.PJ_TB_TOKEN_LEDGER
    SET created_at = '${convertQ(createdAt)}'
    WHERE ledger_id IN (SELECT ledger_id FROM latest_usage);
  `);
}

async function syncUserBalance() {
  await db.query(`
    UPDATE u
    SET
      token_balance = x.balance_after,
      updated_at = SYSDATETIME()
    FROM dbo.PJ_TB_USERS u
    CROSS APPLY (
      SELECT TOP 1 balance_after
      FROM dbo.PJ_TB_TOKEN_LEDGER
      WHERE login_id = u.login_id
      ORDER BY ledger_id DESC
    ) x
    WHERE u.login_id = '${convertQ(REVIEW_EMAIL)}';
  `);
}

async function main() {
  await ensureReviewUser();
  await clearExistingReviewData();

  const firstPaymentId = await createSuccessfulPayment({
    amountKrw: 10000,
    tokenAmount: 110,
    requestedAt: '2026-03-24 10:12:00',
    approvedAt: '2026-03-24 10:13:00',
    merchantRef: 'REVIEW-SEED-10000',
  });

  await createUsageEntry({
    amount: 10,
    usageCode: 'SAJU_PREMIUM',
    referenceType: 'ANALYSIS',
    referenceId: 'REVIEW-SAJU-001',
    memo: '사주 프리미엄 분석 사용',
    createdAt: '2026-03-24 10:20:00',
  });

  const latestSuccessPaymentId = await createSuccessfulPayment({
    amountKrw: 5000,
    tokenAmount: 50,
    requestedAt: '2026-03-28 14:02:00',
    approvedAt: '2026-03-28 14:03:00',
    merchantRef: 'REVIEW-SEED-5000',
  });

  await createUsageEntry({
    amount: 10,
    usageCode: 'FORTUNE_PREMIUM',
    referenceType: 'ANALYSIS',
    referenceId: 'REVIEW-FORTUNE-001',
    memo: '운세 프리미엄 분석 사용',
    createdAt: '2026-03-28 14:11:00',
  });

  const canceledPaymentId = await createCanceledPayment({
    amountKrw: 3000,
    tokenAmount: 30,
    requestedAt: '2026-03-29 09:41:00',
    canceledAt: '2026-03-29 09:42:00',
    merchantRef: 'REVIEW-SEED-CANCEL',
  });

  await syncUserBalance();

  const summary = await db.query(`
    EXEC dbo.PJ_USP_GET_TOKEN_SUMMARY
      @login_id = '${convertQ(REVIEW_EMAIL)}'
  `);

  console.log(JSON.stringify({
    email: REVIEW_EMAIL,
    name: REVIEW_NAME,
    password: REVIEW_PASSWORD,
    payment_ids: {
      first_success: firstPaymentId,
      latest_success: latestSuccessPaymentId,
      canceled: canceledPaymentId,
    },
    current_tokens: Number(summary?.[0]?.current_tokens || 0),
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
