const {
  getActiveUserAnalysisSlot,
} = require('../services/analysis_job_manager');
const {
  getSajuResultRecord,
  getLatestSajuResultRecordByLoginId,
} = require('../services/saju_result_store');
const { toErrorDisplay } = require('../utils/analysis_error');

function getSessionLoginId(req) {
  try {
    return String(req?.session?.user?.login_id || '').trim();
  } catch (e) {
    return '';
  }
}

function buildResultUrl(record) {
  const serviceType = String(record?.serviceType || '').trim().toLowerCase();
  const resultId = String(record?.resultId || '').trim();
  if (!resultId) return '';
  if (serviceType === 'fortune') return `/fortune/result/${resultId}`;
  return `/user/mypage/history/${resultId}`;
}

function normalizeStatusPayload(record) {
  if (!record) return null;
  const createdTs = Date.parse(String(record.createdAt || ''));
  const nowTs = Date.now();
  const elapsedSeconds = Number.isFinite(createdTs) ? Math.max(0, Math.floor((nowTs - createdTs) / 1000)) : 0;
  const serviceType = String(record?.serviceType || '').trim().toLowerCase() || 'saju';
  const status = String(record.status || '').toLowerCase();
  const expectedDuration = serviceType === 'fortune' ? 150 : 210;
  const etaSeconds = (status === 'queued' || status === 'processing')
    ? Math.max(5, expectedDuration - elapsedSeconds)
    : 0;
  const errorDisplay = toErrorDisplay(record.errorMessage);

  return {
    result_id: String(record.resultId || ''),
    service_type: serviceType,
    status,
    step: String(record.step || ''),
    progress_message: String(record.progressMessage || ''),
    result_url: buildResultUrl(record),
    error_message: String(record.errorMessage || ''),
    error_message_display: String(errorDisplay.message || ''),
    error_hint: String(errorDisplay.hint || ''),
    error_code: String(errorDisplay.code || ''),
    elapsed_seconds: elapsedSeconds,
    eta_seconds: etaSeconds,
    updated_at: String(record.updatedAt || ''),
  };
}

exports.getCurrentStatus = async (req, res) => {
  try {
    const loginId = getSessionLoginId(req);
    if (!loginId) {
      return res.status(401).json({
        resp: 'ERROR',
        resp_message: 'LOGIN_REQUIRED',
      });
    }

    const activeSlot = await getActiveUserAnalysisSlot(loginId);
    if (activeSlot?.resultId) {
      const activeRecord = await getSajuResultRecord(activeSlot.resultId);
      const normalizedActive = normalizeStatusPayload(activeRecord);
      if (normalizedActive) {
        return res.json({
          resp: 'OK',
          has_job: true,
          ...normalizedActive,
        });
      }
    }

    const latestRecord = await getLatestSajuResultRecordByLoginId(loginId);
    const normalizedLatest = normalizeStatusPayload(latestRecord);
    if (!normalizedLatest) {
      return res.json({
        resp: 'OK',
        has_job: false,
      });
    }

    return res.json({
      resp: 'OK',
      has_job: true,
      ...normalizedLatest,
    });
  } catch (err) {
    console.error('[ANALYSIS STATUS API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'STATUS_READ_FAILED',
    });
  }
};
