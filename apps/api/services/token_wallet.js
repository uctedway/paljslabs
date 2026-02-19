const db = require('../../core/utils/db');
const { TOKENS_PER_SAJU_REQUEST } = require('./token_constants');

function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function normalizeText(value) {
  return String(value || '').trim();
}

async function getTokenSummary(loginId) {
  const qLoginId = db.convertQ(normalizeText(loginId));
  if (!qLoginId) return null;

  const query = `
    EXEC dbo.PJ_USP_GET_TOKEN_SUMMARY
      @login_id = '${qLoginId}'
  `;

  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : {};
  return row;
}

async function consumeToken({
  loginId,
  amount = TOKENS_PER_SAJU_REQUEST,
  usageCode = 'SAJU_VIEW',
  referenceType = 'SAJU_REQUEST',
  referenceId = '',
  memo = '',
}) {
  const qLoginId = db.convertQ(normalizeText(loginId));
  const qUsageCode = db.convertQ(normalizeText(usageCode));
  const qRefType = db.convertQ(normalizeText(referenceType));
  const qRefId = db.convertQ(normalizeText(referenceId));
  const qMemo = db.convertQ(normalizeText(memo));
  const useAmount = toPositiveInt(amount);

  if (!qLoginId || useAmount <= 0) {
    return {
      resp: 'ERROR',
      resp_message: 'INVALID TOKEN CONSUME INPUT',
    };
  }

  const query = `
    EXEC dbo.PJ_USP_CONSUME_TOKEN
      @login_id = '${qLoginId}',
      @amount = ${useAmount},
      @usage_code = '${qUsageCode}',
      @reference_type = '${qRefType}',
      @reference_id = '${qRefId}',
      @memo = N'${qMemo}'
  `;

  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

async function grantEventToken({
  loginId,
  amount,
  eventCode = 'MANUAL_EVENT',
  memo = '',
}) {
  const qLoginId = db.convertQ(normalizeText(loginId));
  const grantAmount = toPositiveInt(amount);
  const qEventCode = db.convertQ(normalizeText(eventCode));
  const qMemo = db.convertQ(normalizeText(memo));

  if (!qLoginId || grantAmount <= 0) {
    return {
      resp: 'ERROR',
      resp_message: 'INVALID TOKEN GRANT INPUT',
    };
  }

  const query = `
    EXEC dbo.PJ_USP_GRANT_EVENT_TOKEN
      @login_id = '${qLoginId}',
      @amount = ${grantAmount},
      @event_code = '${qEventCode}',
      @memo = N'${qMemo}'
  `;

  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

async function refundToken({
  loginId,
  amount = TOKENS_PER_SAJU_REQUEST,
  referenceType = 'SAJU_REQUEST',
  referenceId = '',
  memo = '',
}) {
  const qLoginId = db.convertQ(normalizeText(loginId));
  const qRefType = db.convertQ(normalizeText(referenceType));
  const qRefId = db.convertQ(normalizeText(referenceId));
  const qMemo = db.convertQ(normalizeText(memo));
  const refundAmount = toPositiveInt(amount);

  if (!qLoginId || refundAmount <= 0 || !qRefType || !qRefId) {
    return {
      resp: 'ERROR',
      resp_message: 'INVALID TOKEN REFUND INPUT',
    };
  }

  const query = `
    EXEC dbo.PJ_USP_REFUND_TOKEN
      @login_id = '${qLoginId}',
      @amount = ${refundAmount},
      @reference_type = '${qRefType}',
      @reference_id = '${qRefId}',
      @memo = N'${qMemo}'
  `;

  const rs = await db.query(query);
  return rs && rs[0] ? rs[0] : {};
}

module.exports = {
  getTokenSummary,
  consumeToken,
  grantEventToken,
  refundToken,
};
