const db = require('../../core/utils/db');
const { normalizeAnalysisMode } = require('./token_constants');

const CACHE_TTL_MS = 60 * 1000;
const promptCache = new Map();

function normalizeServiceCode(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'SAJU' || v === 'FORTUNE' || v === 'SAJU_TONE') return v;
  return '';
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function buildCacheKey(serviceCode, featureKey, toneKey, analysisMode) {
  return `${serviceCode}|${featureKey}|${toneKey}|${analysisMode}`;
}

async function getPromptTemplate({
  serviceCode,
  featureKey = '',
  toneKey = '',
  analysisMode = 'PREMIUM',
  fallbackToPremium = true,
}) {
  const svc = normalizeServiceCode(serviceCode);
  if (!svc) return null;

  const fKey = normalizeKey(featureKey);
  const tKey = normalizeKey(toneKey);
  const mode = normalizeAnalysisMode(analysisMode);
  const cacheKey = buildCacheKey(svc, fKey, tKey, mode);
  const now = Date.now();
  const cached = promptCache.get(cacheKey);
  if (cached && cached.expireAt > now) {
    return cached.value;
  }

  const qSvc = db.convertQ(svc);
  const qFeature = db.convertQ(fKey);
  const qTone = db.convertQ(tKey);
  const qMode = db.convertQ(mode);
  let rs = [];
  try {
    rs = await db.query(`
      SELECT TOP 1
        service_code,
        feature_key,
        tone_key,
        analysis_mode,
        system_prompt,
        user_prompt_guide,
        updated_at
      FROM dbo.PJ_TB_PROMPT_TEMPLATES WITH (NOLOCK)
      WHERE service_code = '${qSvc}'
        AND ISNULL(feature_key, '') = '${qFeature}'
        AND ISNULL(tone_key, '') = '${qTone}'
        AND ISNULL(analysis_mode, 'PREMIUM') = '${qMode}'
        AND is_active = 1
      ORDER BY updated_at DESC, prompt_no DESC
    `);
    if ((!rs || rs.length === 0) && mode === 'TRIAL' && fallbackToPremium) {
      rs = await db.query(`
        SELECT TOP 1
          service_code,
          feature_key,
          tone_key,
          analysis_mode,
          system_prompt,
          user_prompt_guide,
          updated_at
        FROM dbo.PJ_TB_PROMPT_TEMPLATES WITH (NOLOCK)
        WHERE service_code = '${qSvc}'
          AND ISNULL(feature_key, '') = '${qFeature}'
          AND ISNULL(tone_key, '') = '${qTone}'
          AND ISNULL(analysis_mode, 'PREMIUM') = 'PREMIUM'
          AND is_active = 1
        ORDER BY updated_at DESC, prompt_no DESC
      `);
    }
  } catch (err) {
    console.error('[PROMPT TEMPLATE LOAD ERROR]', err.message);
    promptCache.set(cacheKey, {
      value: null,
      expireAt: now + 10 * 1000,
    });
    return null;
  }
  const row = rs && rs[0] ? rs[0] : null;
  const value = row
    ? {
      serviceCode: String(row.service_code || svc).trim().toUpperCase(),
      featureKey: String(row.feature_key || '').trim().toLowerCase(),
      toneKey: String(row.tone_key || '').trim().toLowerCase(),
      analysisMode: normalizeAnalysisMode(row.analysis_mode || mode),
      systemPrompt: String(row.system_prompt || '').trim(),
      userPromptGuide: String(row.user_prompt_guide || '').trim(),
      updatedAt: row.updated_at || null,
    }
    : null;

  promptCache.set(cacheKey, {
    value,
    expireAt: now + CACHE_TTL_MS,
  });

  return value;
}

function clearPromptTemplateCache() {
  promptCache.clear();
}

module.exports = {
  getPromptTemplate,
  clearPromptTemplateCache,
};
