const db = require('../../core/utils/db');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeInt(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? n : 0;
}

async function createPaymentRequest({
  loginId,
  provider,
  amountKrw,
  tokenAmount,
  requestPayload = {},
}) {
  const qLoginId = db.convertQ(normalizeText(loginId));
  const qProvider = db.convertQ(normalizeText(provider));
  const qRequestPayload = db.convertQ(JSON.stringify(requestPayload || {}));
  const amount = normalizeInt(amountKrw);
  const tokens = normalizeInt(tokenAmount);

  const query = `
    EXEC dbo.PJ_USP_CREATE_PAYMENT_REQUEST
      @login_id = '${qLoginId}',
      @provider = '${qProvider}',
      @amount_krw = ${amount},
      @token_amount = ${tokens},
      @request_payload = N'${qRequestPayload}'
  `;

  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

async function getPaymentById(paymentId) {
  const id = normalizeInt(paymentId);
  if (id <= 0) return null;

  const query = `
    EXEC dbo.PJ_USP_GET_PAYMENT
      @payment_id = ${id}
  `;
  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : null;
}

async function updatePaymentPending({
  paymentId,
  providerTxnId,
  pendingPayload = {},
}) {
  const id = normalizeInt(paymentId);
  const qProviderTxnId = db.convertQ(normalizeText(providerTxnId));
  const qPendingPayload = db.convertQ(JSON.stringify(pendingPayload || {}));

  const query = `
    EXEC dbo.PJ_USP_UPDATE_PAYMENT_PENDING
      @payment_id = ${id},
      @provider_txn_id = '${qProviderTxnId}',
      @pending_payload = N'${qPendingPayload}'
  `;
  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

async function confirmPaymentSuccess({
  paymentId,
  providerTxnId,
  approvedPayload = {},
}) {
  const id = normalizeInt(paymentId);
  const qProviderTxnId = db.convertQ(normalizeText(providerTxnId));
  const qApprovedPayload = db.convertQ(JSON.stringify(approvedPayload || {}));

  const query = `
    EXEC dbo.PJ_USP_CONFIRM_PAYMENT_SUCCESS
      @payment_id = ${id},
      @provider_txn_id = '${qProviderTxnId}',
      @approved_payload = N'${qApprovedPayload}'
  `;

  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

async function markPaymentFailed({
  paymentId,
  providerTxnId = '',
  errorMessage = '',
  failedPayload = {},
}) {
  const id = normalizeInt(paymentId);
  const qProviderTxnId = db.convertQ(normalizeText(providerTxnId));
  const qErrorMessage = db.convertQ(normalizeText(errorMessage));
  const qFailedPayload = db.convertQ(JSON.stringify(failedPayload || {}));

  const query = `
    EXEC dbo.PJ_USP_MARK_PAYMENT_FAILED
      @payment_id = ${id},
      @provider_txn_id = '${qProviderTxnId}',
      @error_message = N'${qErrorMessage}',
      @failed_payload = N'${qFailedPayload}'
  `;

  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

async function markPaymentCanceled({
  paymentId,
  providerTxnId = '',
  memo = '',
  canceledPayload = {},
}) {
  const id = normalizeInt(paymentId);
  const qProviderTxnId = db.convertQ(normalizeText(providerTxnId));
  const qMemo = db.convertQ(normalizeText(memo));
  const qCanceledPayload = db.convertQ(JSON.stringify(canceledPayload || {}));

  const query = `
    EXEC dbo.PJ_USP_MARK_PAYMENT_CANCELED
      @payment_id = ${id},
      @provider_txn_id = '${qProviderTxnId}',
      @memo = N'${qMemo}',
      @canceled_payload = N'${qCanceledPayload}'
  `;

  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

module.exports = {
  createPaymentRequest,
  getPaymentById,
  updatePaymentPending,
  confirmPaymentSuccess,
  markPaymentFailed,
  markPaymentCanceled,
};
