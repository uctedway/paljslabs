const db = require('../../core/utils/db');

const LOCK_TABLE = 'dbo.PJ_ANALYSIS_JOB_LOCKS';
const STALE_MINUTES = 30;
let ensureTablePromise = null;

async function ensureLockTable() {
  if (ensureTablePromise) return ensureTablePromise;

  ensureTablePromise = db.query(`
    IF OBJECT_ID('${LOCK_TABLE}', 'U') IS NULL
    BEGIN
      CREATE TABLE ${LOCK_TABLE} (
        login_id NVARCHAR(128) NOT NULL PRIMARY KEY,
        result_id NVARCHAR(64) NOT NULL,
        service_type NVARCHAR(32) NOT NULL,
        created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_${LOCK_TABLE.split('.').pop()}_UPDATED
        ON ${LOCK_TABLE} (updated_at DESC);
    END
  `);

  try {
    await ensureTablePromise;
  } catch (err) {
    ensureTablePromise = null;
    throw err;
  }
}

function normalizeText(v) {
  return String(v || '').trim();
}

async function tryAcquireUserAnalysisSlot({ loginId, resultId, serviceType }) {
  await ensureLockTable();

  const normalizedLoginId = normalizeText(loginId);
  const normalizedResultId = normalizeText(resultId);
  const normalizedServiceType = normalizeText(serviceType || 'saju');
  if (!normalizedLoginId || !normalizedResultId) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }

  const qLoginId = db.convertQ(normalizedLoginId);
  const qResultId = db.convertQ(normalizedResultId);
  const qServiceType = db.convertQ(normalizedServiceType);

  const query = `
    SET NOCOUNT ON;
    DELETE FROM ${LOCK_TABLE}
    WHERE updated_at < DATEADD(MINUTE, -${STALE_MINUTES}, SYSUTCDATETIME());

    BEGIN TRAN;
      IF EXISTS (
        SELECT 1
        FROM ${LOCK_TABLE} WITH (UPDLOCK, HOLDLOCK)
        WHERE login_id = N'${qLoginId}'
      )
      BEGIN
        SELECT TOP 1 result_id, service_type
        FROM ${LOCK_TABLE}
        WHERE login_id = N'${qLoginId}';
        ROLLBACK TRAN;
        RETURN;
      END

      INSERT INTO ${LOCK_TABLE} (login_id, result_id, service_type, created_at, updated_at)
      VALUES (N'${qLoginId}', N'${qResultId}', N'${qServiceType}', SYSUTCDATETIME(), SYSUTCDATETIME());
    COMMIT TRAN;

    SELECT N'${qResultId}' AS result_id, N'${qServiceType}' AS service_type;
  `;

  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : null;
  const rowResultId = normalizeText(row?.result_id);
  if (rowResultId !== normalizedResultId) {
    return {
      ok: false,
      reason: 'ALREADY_RUNNING',
      existingResultId: rowResultId,
      existingServiceType: normalizeText(row?.service_type),
    };
  }

  return { ok: true };
}

async function keepAliveUserAnalysisSlot({ loginId, resultId }) {
  await ensureLockTable();

  const normalizedLoginId = normalizeText(loginId);
  const normalizedResultId = normalizeText(resultId);
  if (!normalizedLoginId || !normalizedResultId) return false;

  const qLoginId = db.convertQ(normalizedLoginId);
  const qResultId = db.convertQ(normalizedResultId);
  const query = `
    UPDATE ${LOCK_TABLE}
    SET updated_at = SYSUTCDATETIME()
    WHERE login_id = N'${qLoginId}'
      AND result_id = N'${qResultId}'
  `;
  await db.query(query);
  return true;
}

async function releaseUserAnalysisSlot({ loginId, resultId }) {
  await ensureLockTable();

  const normalizedLoginId = normalizeText(loginId);
  const normalizedResultId = normalizeText(resultId);
  if (!normalizedLoginId) return false;

  const qLoginId = db.convertQ(normalizedLoginId);
  const qResultId = db.convertQ(normalizedResultId);
  const hasResult = !!normalizedResultId;
  const query = `
    DELETE FROM ${LOCK_TABLE}
    WHERE login_id = N'${qLoginId}'
      ${hasResult ? `AND result_id = N'${qResultId}'` : ''}
  `;
  await db.query(query);
  return true;
}

async function getActiveUserAnalysisSlot(loginId) {
  await ensureLockTable();

  const normalizedLoginId = normalizeText(loginId);
  if (!normalizedLoginId) return null;

  const qLoginId = db.convertQ(normalizedLoginId);
  const query = `
    DELETE FROM ${LOCK_TABLE}
    WHERE updated_at < DATEADD(MINUTE, -${STALE_MINUTES}, SYSUTCDATETIME());

    SELECT TOP 1
      login_id,
      result_id,
      service_type,
      created_at,
      updated_at
    FROM ${LOCK_TABLE}
    WHERE login_id = N'${qLoginId}'
  `;
  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : null;
  if (!row) return null;
  return {
    loginId: normalizeText(row.login_id),
    resultId: normalizeText(row.result_id),
    serviceType: normalizeText(row.service_type),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  tryAcquireUserAnalysisSlot,
  keepAliveUserAnalysisSlot,
  releaseUserAnalysisSlot,
  getActiveUserAnalysisSlot,
};
