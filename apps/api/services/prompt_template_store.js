const db = require('../../core/utils/db');

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

function buildCacheKey(serviceCode, featureKey, toneKey) {
  return `${serviceCode}|${featureKey}|${toneKey}`;
}

async function getPromptTemplate({ serviceCode, featureKey = '', toneKey = '' }) {
  const svc = normalizeServiceCode(serviceCode);
  if (!svc) return null;

  const fKey = normalizeKey(featureKey);
  const tKey = normalizeKey(toneKey);
  const cacheKey = buildCacheKey(svc, fKey, tKey);
  const now = Date.now();
  const cached = promptCache.get(cacheKey);
  if (cached && cached.expireAt > now) {
    return cached.value;
  }

  const qSvc = db.convertQ(svc);
  const qFeature = db.convertQ(fKey);
  const qTone = db.convertQ(tKey);
  let rs = [];
  try {
    rs = await db.query(`
      SELECT TOP 1
        service_code,
        feature_key,
        tone_key,
        system_prompt,
        user_prompt_guide,
        updated_at
      FROM dbo.PJ_TB_PROMPT_TEMPLATES WITH (NOLOCK)
      WHERE service_code = '${qSvc}'
        AND ISNULL(feature_key, '') = '${qFeature}'
        AND ISNULL(tone_key, '') = '${qTone}'
        AND is_active = 1
      ORDER BY updated_at DESC, prompt_no DESC
    `);
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
