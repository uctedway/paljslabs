const { randomUUID } = require('crypto');
const db = require('../../core/utils/db');

const RESULT_TABLE = 'dbo.PJ_SAJU_RESULT_STORE';
let ensureTablePromise = null;

async function ensureResultTable() {
  if (ensureTablePromise) return ensureTablePromise;

  ensureTablePromise = db.query(`
    IF OBJECT_ID('${RESULT_TABLE}', 'U') IS NULL
    BEGIN
      CREATE TABLE ${RESULT_TABLE} (
        result_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        payload_json NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
      );
    END
  `);

  try {
    await ensureTablePromise;
  } catch (err) {
    ensureTablePromise = null;
    throw err;
  }
}

async function createSajuResultRecord(initialData = {}) {
  await ensureResultTable();

  const customResultId = String(initialData?.resultId || '').trim();
  const resultId = customResultId || randomUUID();
  const now = new Date().toISOString();

  const record = {
    resultId,
    status: 'queued', // queued | processing | completed | failed
    step: 'QUEUED',
    progressMessage: '요청을 접수했습니다.',
    createdAt: now,
    updatedAt: now,
    ...initialData,
  };

  const qResultId = db.convertQ(resultId);
  const qPayload = db.convertQ(JSON.stringify(record));
  const query = `
    INSERT INTO ${RESULT_TABLE} (result_id, payload_json, created_at, updated_at)
    VALUES (N'${qResultId}', N'${qPayload}', SYSUTCDATETIME(), SYSUTCDATETIME())
  `;
  await db.query(query);

  return record;
}

async function getSajuResultRecord(resultId) {
  await ensureResultTable();

  const normalizedResultId = String(resultId || '');
  if (!normalizedResultId) return null;

  const qResultId = db.convertQ(normalizedResultId);
  const query = `
    SELECT TOP 1 payload_json
    FROM ${RESULT_TABLE}
    WHERE result_id = N'${qResultId}'
  `;
  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : null;
  if (!row || !row.payload_json) return null;

  try {
    return JSON.parse(row.payload_json);
  } catch (err) {
    console.error('[SAJU RESULT STORE] payload_json parse 실패:', err.message);
    return null;
  }
}

async function updateSajuResultRecord(resultId, patch = {}) {
  await ensureResultTable();

  const current = await getSajuResultRecord(resultId);
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  const qResultId = db.convertQ(String(resultId || ''));
  const qPayload = db.convertQ(JSON.stringify(next));
  const query = `
    UPDATE ${RESULT_TABLE}
    SET payload_json = N'${qPayload}',
        updated_at = SYSUTCDATETIME()
    WHERE result_id = N'${qResultId}'
  `;
  await db.query(query);

  return next;
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function mapHistoryItem(row = {}) {
  let payload = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch (err) {
    payload = {};
  }

  const req = payload.request || {};
  const result = payload.result || {};
  const share = payload.share || {};
  const status = String(payload.status || '');
  const statusTextMap = {
    queued: '대기',
    processing: '진행중',
    completed: '완료',
    failed: '실패',
  };

  return {
    resultId: String(payload.resultId || row.result_id || ''),
    status,
    statusText: statusTextMap[status] || status || '-',
    step: String(payload.step || ''),
    progressMessage: String(payload.progressMessage || ''),
    createdAt: String(payload.createdAt || row.created_at || ''),
    updatedAt: String(payload.updatedAt || row.updated_at || ''),
    request: req,
    result,
    share: {
      enabled: !!share.enabled,
      token: String(share.token || ''),
      createdAt: String(share.createdAt || ''),
    },
    resultPreview: String(result.claudeResult || '').slice(0, 180),
  };
}

function buildShareToken() {
  const a = randomUUID().replace(/-/g, '');
  const b = randomUUID().replace(/-/g, '');
  return `${a}${b}`;
}

async function listSajuResultRecordsByLoginId(loginId, limit = 20) {
  await ensureResultTable();

  const normalizedLoginId = String(loginId || '').trim();
  if (!normalizedLoginId) return [];

  const topN = toPositiveInt(limit, 20);
  const safeTopN = Math.min(topN, 100);
  const qLoginId = db.convertQ(normalizedLoginId);
  const query = `
    SELECT TOP ${safeTopN}
      result_id,
      payload_json,
      created_at,
      updated_at
    FROM ${RESULT_TABLE}
    WHERE JSON_VALUE(payload_json, '$.loginId') = '${qLoginId}'
    ORDER BY created_at DESC
  `;

  const rs = await db.query(query);
  return (rs || []).map(mapHistoryItem).filter((item) => !!item.resultId);
}

async function getSajuResultRecordByLoginId(loginId, resultId) {
  await ensureResultTable();

  const normalizedLoginId = String(loginId || '').trim();
  const normalizedResultId = String(resultId || '').trim();
  if (!normalizedLoginId || !normalizedResultId) return null;

  const qLoginId = db.convertQ(normalizedLoginId);
  const qResultId = db.convertQ(normalizedResultId);
  const query = `
    SELECT TOP 1
      result_id,
      payload_json,
      created_at,
      updated_at
    FROM ${RESULT_TABLE}
    WHERE result_id = N'${qResultId}'
      AND JSON_VALUE(payload_json, '$.loginId') = '${qLoginId}'
  `;

  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : null;
  if (!row) return null;
  return mapHistoryItem(row);
}

async function createOrGetShareTokenByLoginId(loginId, resultId) {
  const record = await getSajuResultRecordByLoginId(loginId, resultId);
  if (!record) return null;

  const currentToken = String(record.share?.token || '');
  if (record.share?.enabled && currentToken) {
    return currentToken;
  }

  const shareToken = buildShareToken();
  const current = await getSajuResultRecord(resultId);
  if (!current) return null;

  await updateSajuResultRecord(resultId, {
    share: {
      enabled: true,
      token: shareToken,
      createdAt: new Date().toISOString(),
    },
  });

  return shareToken;
}

async function getSajuResultRecordByShareToken(shareToken) {
  await ensureResultTable();

  const normalizedToken = String(shareToken || '').trim();
  if (!normalizedToken) return null;

  const qToken = db.convertQ(normalizedToken);
  const query = `
    SELECT TOP 1
      result_id,
      payload_json,
      created_at,
      updated_at
    FROM ${RESULT_TABLE}
    WHERE JSON_VALUE(payload_json, '$.share.token') = '${qToken}'
      AND JSON_VALUE(payload_json, '$.share.enabled') = 'true'
  `;

  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : null;
  if (!row) return null;
  return mapHistoryItem(row);
}

async function getLatestSajuResultRecordByLoginId(loginId) {
  await ensureResultTable();

  const normalizedLoginId = String(loginId || '').trim();
  if (!normalizedLoginId) return null;

  const qLoginId = db.convertQ(normalizedLoginId);
  const query = `
    SELECT TOP 1 payload_json
    FROM ${RESULT_TABLE}
    WHERE JSON_VALUE(payload_json, '$.loginId') = '${qLoginId}'
    ORDER BY updated_at DESC
  `;
  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : null;
  if (!row || !row.payload_json) return null;

  try {
    return JSON.parse(row.payload_json);
  } catch (err) {
    console.error('[SAJU RESULT STORE] latest payload_json parse 실패:', err.message);
    return null;
  }
}

module.exports = {
  createSajuResultRecord,
  getSajuResultRecord,
  updateSajuResultRecord,
  listSajuResultRecordsByLoginId,
  getSajuResultRecordByLoginId,
  createOrGetShareTokenByLoginId,
  getSajuResultRecordByShareToken,
  getLatestSajuResultRecordByLoginId,
};
