const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../core/utils/db');
const { clearPromptTemplateCache } = require('../../api/services/prompt_template_store');

function normalizeNextPath(raw) {
  const v = String(raw || '').trim();
  if (!v.startsWith('/manage')) return '/manage';
  return v;
}

function hashManagePassword(rawPassword) {
  const password = String(rawPassword || '');
  const salt = String(process.env.MANAGE_PASSWORD_SALT || '');
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parsePositiveInt(raw, defaultValue, maxValue = 500) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return defaultValue;
  return Math.min(n, maxValue);
}

const KST_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatKstDateTime(raw) {
  if (!raw) return '-';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  return KST_FORMATTER.format(d).replace(' ', ' ');
}

function getPricingConfig() {
  const inputUsdPer1M = toNumber(process.env.MANAGE_CLAUDE_INPUT_USD_PER_1M, 3);
  const outputUsdPer1M = toNumber(process.env.MANAGE_CLAUDE_OUTPUT_USD_PER_1M, 15);
  const usdKrwRate = toNumber(process.env.MANAGE_USD_KRW_RATE, 1350);
  const tokenBudget = toNumber(process.env.MANAGE_CLAUDE_TOKEN_BUDGET, 0);
  return { inputUsdPer1M, outputUsdPer1M, usdKrwRate, tokenBudget };
}

function estimateCostUsd(promptTokens, completionTokens, pricing) {
  const inputCost = (toNumber(promptTokens) / 1_000_000) * pricing.inputUsdPer1M;
  const outputCost = (toNumber(completionTokens) / 1_000_000) * pricing.outputUsdPer1M;
  return inputCost + outputCost;
}

function buildPager({ totalRows, page, pageSize }) {
  const total = toNumber(totalRows);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    totalRows: total,
    totalPages,
    page: currentPage,
    pageSize,
    offset: (currentPage - 1) * pageSize,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
    prevPage: currentPage > 1 ? currentPage - 1 : 1,
    nextPage: currentPage < totalPages ? currentPage + 1 : totalPages,
  };
}

function getInfoPageErrorMessage(code) {
  const c = String(code || '').trim().toLowerCase();
  if (c === 'required') return '관리자 표시 이름을 입력해주세요.';
  if (c === 'failed') return '정보 변경에 실패했습니다. 잠시 후 다시 시도해주세요.';
  return '';
}

function getInfoPageNoticeMessage(code) {
  return String(code || '').trim().toLowerCase() === 'changed'
    ? '정보가 변경되었습니다.'
    : '';
}

function getPasswordPageErrorMessage(code) {
  const c = String(code || '').trim().toLowerCase();
  const table = {
    required: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.',
    mismatch: '새 비밀번호 확인이 일치하지 않습니다.',
    weak: '새 비밀번호는 8자 이상으로 입력해주세요.',
    same: '새 비밀번호는 현재 비밀번호와 달라야 합니다.',
    invalid_current: '현재 비밀번호가 올바르지 않습니다.',
    failed: '비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요.',
  };
  return table[c] || '';
}

function getPasswordPageNoticeMessage(code) {
  return String(code || '').trim().toLowerCase() === 'changed'
    ? '비밀번호가 변경되었습니다.'
    : '';
}

function normalizeEventCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return 'MANUAL_EVENT';
  return /^[A-Z0-9_]{3,40}$/.test(code) ? code : 'MANUAL_EVENT';
}

const SAJU_PROMPT_BASE_FILE = path.join(__dirname, '../../api/prompts/saju/base.txt');
const SAJU_PROMPT_TYPE_DIR = path.join(__dirname, '../../api/prompts/saju/types');
const FORTUNE_PROMPT_BASE_FILE = path.join(__dirname, '../../api/prompts/fortune/base.txt');
const FORTUNE_PROMPT_DIR = path.join(__dirname, '../../api/prompts/fortune');

const PROMPT_TONE_OPTIONS = [
  { key: 'soft', label: '부드러운 상담' },
  { key: 'balanced', label: '균형 상담' },
  { key: 'insight', label: '통찰 강화' },
  { key: 'direct', label: '직설 상담' },
  { key: 'factbomb', label: '팩트폭격' },
];

const PROMPT_FEATURE_OPTIONS = [
  { key: 'today', label: '오늘의 운세' },
  { key: 'flow', label: '대운·세운' },
  { key: 'compatibility', label: '궁합' },
  { key: 'naming', label: '작명/개명 보조' },
  { key: 'date-selection', label: '택일' },
];

const PROMPT_SCOPE_OPTIONS = [
  { key: 'saju', label: '사주', serviceCode: 'SAJU', featureKey: 'saju' },
  { key: 'tone', label: '상담톤', serviceCode: 'SAJU_TONE', featureKey: '' },
  { key: 'compatibility', label: '궁합', serviceCode: 'FORTUNE', featureKey: 'compatibility' },
  { key: 'today', label: '오늘의 운세', serviceCode: 'FORTUNE', featureKey: 'today' },
  { key: 'flow', label: '대운·세운', serviceCode: 'FORTUNE', featureKey: 'flow' },
  { key: 'naming', label: '작명/개명 보조', serviceCode: 'FORTUNE', featureKey: 'naming' },
  { key: 'date-selection', label: '택일', serviceCode: 'FORTUNE', featureKey: 'date-selection' },
];

let promptFileCache = null;

function normalizePromptScope(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return PROMPT_SCOPE_OPTIONS.some((item) => item.key === v) ? v : 'saju';
}

function getPromptScopeMeta(scopeKey) {
  return PROMPT_SCOPE_OPTIONS.find((item) => item.key === scopeKey) || PROMPT_SCOPE_OPTIONS[0];
}

function loadPromptFileDefaults() {
  if (promptFileCache) return promptFileCache;

  const sajuBase = fs.readFileSync(SAJU_PROMPT_BASE_FILE, 'utf8');
  const sajuTypes = {};
  PROMPT_TONE_OPTIONS.forEach((tone) => {
    const filePath = path.join(SAJU_PROMPT_TYPE_DIR, `${tone.key}.txt`);
    sajuTypes[tone.key] = fs.readFileSync(filePath, 'utf8');
  });

  const fortuneBase = fs.readFileSync(FORTUNE_PROMPT_BASE_FILE, 'utf8');
  const fortuneFeatures = {};
  PROMPT_FEATURE_OPTIONS.forEach((feature) => {
    const filename = feature.key === 'date-selection' ? 'date_selection.txt' : `${feature.key}.txt`;
    const filePath = path.join(FORTUNE_PROMPT_DIR, filename);
    fortuneFeatures[feature.key] = fs.readFileSync(filePath, 'utf8');
  });

  promptFileCache = { sajuBase, sajuTypes, fortuneBase, fortuneFeatures };
  return promptFileCache;
}

function buildDefaultSystemPromptByScope(serviceCode, featureKey, toneKey) {
  try {
    const defaults = loadPromptFileDefaults();
    if (serviceCode === 'SAJU') {
      return String(defaults.sajuBase || '').trim();
    }
    if (serviceCode === 'SAJU_TONE') {
      return '';
    }
    const typePrompt = defaults.fortuneFeatures[featureKey] || defaults.fortuneFeatures.today || '';
    return `${defaults.fortuneBase}\n\n# 분석 타입\n${typePrompt}`.trim();
  } catch (err) {
    console.error('[MANAGE PROMPT DEFAULT LOAD ERROR]', err.message);
    return '';
  }
}

function getPromptPageNoticeMessage(code) {
  const c = String(code || '').trim().toLowerCase();
  if (c === 'saved') return '프롬프트가 저장되었습니다.';
  return '';
}

function getPromptPageErrorMessage(code) {
  const c = String(code || '').trim().toLowerCase();
  if (c === 'required') return '시스템 프롬프트를 입력해주세요.';
  if (c === 'failed') return '프롬프트 저장에 실패했습니다. 잠시 후 다시 시도해주세요.';
  return '';
}

function safeJsonStringify(value, fallback = '{}') {
  try {
    return JSON.stringify(value == null ? {} : value);
  } catch (_err) {
    return fallback;
  }
}

function getClaudeTokenExprSql() {
  const promptExpr = `
    ISNULL(
      TRY_CONVERT(BIGINT, JSON_VALUE(response_data, '$.prompt_tokens')),
      ISNULL(TRY_CONVERT(BIGINT, JSON_VALUE(response_data, '$.usage.input_tokens')), 0)
    )
  `;
  const completionExpr = `
    ISNULL(
      TRY_CONVERT(BIGINT, JSON_VALUE(response_data, '$.completion_tokens')),
      ISNULL(TRY_CONVERT(BIGINT, JSON_VALUE(response_data, '$.usage.output_tokens')), 0)
    )
  `;
  const totalExpr = `
    COALESCE(
      TRY_CONVERT(BIGINT, JSON_VALUE(response_data, '$.total_tokens')),
      (${promptExpr}) + (${completionExpr})
    )
  `;
  return { promptExpr, completionExpr, totalExpr };
}

async function loadCurrentManageAdmin(req) {
  const manageAdmin = req.session?.manageAdmin || {};
  const adminId = String(manageAdmin.admin_id || '').trim();
  let adminName = String(manageAdmin.admin_name || '').trim();
  if (!adminId) return manageAdmin;

  const qAdminId = db.convertQ(adminId);
  const rs = await db.query(`
    SELECT TOP 1 admin_name
    FROM dbo.PJ_TB_MANAGE_ADMINS WITH (NOLOCK)
    WHERE admin_id = '${qAdminId}'
  `);
  const row = rs && rs[0] ? rs[0] : {};
  adminName = String(row.admin_name || adminName || '').trim();
  req.session.manageAdmin = {
    ...manageAdmin,
    admin_name: adminName || manageAdmin.admin_name || '관리자',
  };
  return req.session.manageAdmin;
}

async function writeManageActionLog(req, payload = {}) {
  try {
    const manageAdmin = req.session?.manageAdmin || {};
    const adminId = String(payload.adminId || manageAdmin.admin_id || '').trim();
    const adminName = String(payload.adminName || manageAdmin.admin_name || '').trim();
    const actionCode = String(payload.actionCode || '').trim().toUpperCase() || 'UNKNOWN_ACTION';
    const targetType = String(payload.targetType || '').trim() || null;
    const targetId = String(payload.targetId || '').trim() || null;
    const resultStatus = String(payload.resultStatus || '').trim().toUpperCase() || 'SUCCESS';
    const requestData = safeJsonStringify(payload.requestData || {}, '{}');
    const responseData = safeJsonStringify(payload.responseData || {}, '{}');
    const ipAddressRaw = String(
      req.headers?.['x-forwarded-for']
      || req.ip
      || req.connection?.remoteAddress
      || ''
    ).trim();
    const ipAddress = ipAddressRaw.split(',')[0].trim().slice(0, 100) || null;
    const userAgent = String(req.headers?.['user-agent'] || '').trim().slice(0, 500) || null;

    const qAdminId = db.convertQ(adminId);
    const qAdminName = db.convertQ(adminName);
    const qActionCode = db.convertQ(actionCode);
    const qTargetType = db.convertQ(targetType || '');
    const qTargetId = db.convertQ(targetId || '');
    const qResultStatus = db.convertQ(resultStatus);
    const qRequestData = db.convertQ(requestData);
    const qResponseData = db.convertQ(responseData);
    const qIpAddress = db.convertQ(ipAddress || '');
    const qUserAgent = db.convertQ(userAgent || '');

    await db.query(`
      EXEC dbo.PJ_USP_MANAGE_LOG_ACTION
        @admin_id='${qAdminId}',
        @admin_name=N'${qAdminName}',
        @action_code='${qActionCode}',
        @target_type='${qTargetType}',
        @target_id='${qTargetId}',
        @result_status='${qResultStatus}',
        @request_data=N'${qRequestData}',
        @response_data=N'${qResponseData}',
        @ip_address='${qIpAddress}',
        @user_agent=N'${qUserAgent}'
    `);
  } catch (err) {
    console.error('[MANAGE ACTION LOG ERROR]', err.message);
  }
}

async function loadDashboardSummary() {
  const pricing = getPricingConfig();
  const { promptExpr, completionExpr, totalExpr } = getClaudeTokenExprSql();

  const [apiRows, claudeRows, tokenRows, featureRows] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*) AS total_calls,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_calls,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_calls,
        AVG(CASE WHEN duration_ms > 0 THEN CAST(duration_ms AS FLOAT) END) AS avg_duration_ms,
        SUM(CASE WHEN requested_at >= DATEADD(HOUR, -24, SYSDATETIME()) THEN 1 ELSE 0 END) AS calls_24h
      FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)
    `),
    db.query(`
      SELECT
        COUNT(*) AS total_calls,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_calls,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_calls,
        AVG(CASE WHEN duration_ms > 0 THEN CAST(duration_ms AS FLOAT) END) AS avg_duration_ms,
        SUM(${promptExpr}) AS total_prompt_tokens,
        SUM(${completionExpr}) AS total_completion_tokens,
        SUM(${totalExpr}) AS total_tokens
      FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)
      WHERE service_code = 'CLAUDE'
    `),
    db.query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.PJ_TB_USERS WITH (NOLOCK)) AS user_count,
        (SELECT ISNULL(SUM(token_balance), 0) FROM dbo.PJ_TB_USERS WITH (NOLOCK)) AS total_token_balance,
        (SELECT ISNULL(SUM(CASE WHEN entry_type='USAGE' AND change_tokens < 0 THEN -change_tokens ELSE 0 END), 0)
         FROM dbo.PJ_TB_TOKEN_LEDGER WITH (NOLOCK)
         WHERE created_at >= DATEADD(DAY, -7, SYSDATETIME())) AS consumed_tokens_7d
    `),
    db.query(`
      SELECT TOP 6
        COALESCE(NULLIF(JSON_VALUE(response_data, '$.feature_key'), ''), NULLIF(JSON_VALUE(request_data, '$.feature_key'), ''), '(unknown)') AS feature_key,
        COUNT(*) AS call_count,
        AVG(CAST(${totalExpr} AS FLOAT)) AS avg_tokens,
        SUM(${totalExpr}) AS total_tokens
      FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)
      WHERE service_code = 'CLAUDE'
        AND status = 'SUCCESS'
      GROUP BY COALESCE(NULLIF(JSON_VALUE(response_data, '$.feature_key'), ''), NULLIF(JSON_VALUE(request_data, '$.feature_key'), ''), '(unknown)')
      ORDER BY COUNT(*) DESC, feature_key ASC
    `),
  ]);

  const api = apiRows?.[0] || {};
  const claude = claudeRows?.[0] || {};
  const token = tokenRows?.[0] || {};
  const totalPromptTokens = toNumber(claude.total_prompt_tokens);
  const totalCompletionTokens = toNumber(claude.total_completion_tokens);
  const totalTokens = toNumber(claude.total_tokens);
  const estUsd = estimateCostUsd(totalPromptTokens, totalCompletionTokens, pricing);
  const estKrw = estUsd * pricing.usdKrwRate;
  const budgetRemaining = pricing.tokenBudget > 0 ? Math.max(0, pricing.tokenBudget - totalTokens) : null;

  return {
    pricing,
    apiSummary: {
      totalCalls: toNumber(api.total_calls),
      successCalls: toNumber(api.success_calls),
      failedCalls: toNumber(api.failed_calls),
      avgDurationMs: Math.round(toNumber(api.avg_duration_ms)),
      calls24h: toNumber(api.calls_24h),
    },
    claudeSummary: {
      totalCalls: toNumber(claude.total_calls),
      successCalls: toNumber(claude.success_calls),
      failedCalls: toNumber(claude.failed_calls),
      avgDurationMs: Math.round(toNumber(claude.avg_duration_ms)),
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      estimatedUsd: estUsd,
      estimatedKrw: estKrw,
      budgetRemainingTokens: budgetRemaining,
    },
    tokenSummary: {
      userCount: toNumber(token.user_count),
      totalTokenBalance: toNumber(token.total_token_balance),
      consumedTokens7d: toNumber(token.consumed_tokens_7d),
    },
    featureSummary: Array.isArray(featureRows) ? featureRows : [],
  };
}

async function loadCallMonitoring({ page, pageSize }) {
  const callTotalRows = await db.query(`SELECT COUNT(*) AS total_rows FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)`);
  const failTotalRows = await db.query(`SELECT COUNT(*) AS total_rows FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK) WHERE status='FAILED'`);
  const callPager = buildPager({ totalRows: callTotalRows?.[0]?.total_rows, page, pageSize });
  const failPager = buildPager({ totalRows: failTotalRows?.[0]?.total_rows, page, pageSize });
  const { promptExpr, completionExpr, totalExpr } = getClaudeTokenExprSql();

  const [recentCalls, recentFailures] = await Promise.all([
    db.query(`
      SELECT
        req_id,
        service_code,
        status,
        duration_ms,
        requested_at,
        responded_at,
        JSON_VALUE(request_data, '$.provider') AS source_provider,
        JSON_VALUE(request_data, '$.input.name') AS input_name,
        JSON_VALUE(request_data, '$.input.counselingType') AS counseling_type,
        COALESCE(NULLIF(JSON_VALUE(response_data, '$.feature_key'), ''), NULLIF(JSON_VALUE(request_data, '$.feature_key'), ''), '-') AS feature_key,
        JSON_VALUE(response_data, '$.model') AS model_name,
        ${promptExpr} AS prompt_tokens,
        ${completionExpr} AS completion_tokens,
        ${totalExpr} AS total_tokens
      FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)
      ORDER BY req_id DESC
      OFFSET ${callPager.offset} ROWS FETCH NEXT ${callPager.pageSize} ROWS ONLY
    `),
    db.query(`
      SELECT
        req_id,
        service_code,
        duration_ms,
        requested_at,
        LEFT(CAST(error_message AS NVARCHAR(MAX)), 500) AS error_message
      FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)
      WHERE status = 'FAILED'
      ORDER BY req_id DESC
      OFFSET ${failPager.offset} ROWS FETCH NEXT ${failPager.pageSize} ROWS ONLY
    `),
  ]);

  return {
    recentCalls: (Array.isArray(recentCalls) ? recentCalls : []).map((row) => ({
      ...row,
      requested_at_kst: formatKstDateTime(row.requested_at),
      responded_at_kst: formatKstDateTime(row.responded_at),
    })),
    recentFailures: (Array.isArray(recentFailures) ? recentFailures : []).map((row) => ({
      ...row,
      requested_at_kst: formatKstDateTime(row.requested_at),
    })),
    callPager,
    failPager,
  };
}

async function loadTokenMonitoring() {
  const pricing = getPricingConfig();
  const { promptExpr, completionExpr, totalExpr } = getClaudeTokenExprSql();

  const [claudeRows, featureRows] = await Promise.all([
    db.query(`
      SELECT
        SUM(${promptExpr}) AS total_prompt_tokens,
        SUM(${completionExpr}) AS total_completion_tokens,
        SUM(${totalExpr}) AS total_tokens,
        AVG(CAST(${totalExpr} AS FLOAT)) AS avg_total_tokens
      FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)
      WHERE service_code = 'CLAUDE'
        AND status = 'SUCCESS'
    `),
    db.query(`
      SELECT
        COALESCE(NULLIF(JSON_VALUE(response_data, '$.feature_key'), ''), NULLIF(JSON_VALUE(request_data, '$.feature_key'), ''), '(unknown)') AS feature_key,
        COUNT(*) AS call_count,
        SUM(${promptExpr}) AS prompt_tokens,
        SUM(${completionExpr}) AS completion_tokens,
        SUM(${totalExpr}) AS total_tokens,
        AVG(CAST(${totalExpr} AS FLOAT)) AS avg_tokens
      FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)
      WHERE service_code = 'CLAUDE'
        AND status = 'SUCCESS'
      GROUP BY COALESCE(NULLIF(JSON_VALUE(response_data, '$.feature_key'), ''), NULLIF(JSON_VALUE(request_data, '$.feature_key'), ''), '(unknown)')
      ORDER BY call_count DESC, feature_key ASC
    `),
  ]);

  const claude = claudeRows?.[0] || {};
  const totalPromptTokens = toNumber(claude.total_prompt_tokens);
  const totalCompletionTokens = toNumber(claude.total_completion_tokens);
  const totalTokens = toNumber(claude.total_tokens);
  const totalUsd = estimateCostUsd(totalPromptTokens, totalCompletionTokens, pricing);
  const totalKrw = totalUsd * pricing.usdKrwRate;
  const budgetRemaining = pricing.tokenBudget > 0 ? Math.max(0, pricing.tokenBudget - totalTokens) : null;

  const features = (Array.isArray(featureRows) ? featureRows : []).map((row) => {
    const promptTokens = toNumber(row.prompt_tokens);
    const completionTokens = toNumber(row.completion_tokens);
    const usd = estimateCostUsd(promptTokens, completionTokens, pricing);
    return {
      ...row,
      estimated_usd: usd,
      estimated_krw: usd * pricing.usdKrwRate,
    };
  });

  return {
    pricing,
    totals: {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      avgTotalTokens: Math.round(toNumber(claude.avg_total_tokens)),
      estimatedUsd: totalUsd,
      estimatedKrw: totalKrw,
      budgetRemainingTokens: budgetRemaining,
    },
    features,
  };
}

async function loadUserList({ keyword, page, pageSize }) {
  const q = String(keyword || '').trim();
  const qLike = db.convertQ(q);
  const whereSql = q
    ? `
      WHERE
        u.login_id LIKE '%${qLike}%'
        OR u.email LIKE '%${qLike}%'
        OR ISNULL(u.user_name, N'') LIKE N'%${qLike}%'
    `
    : '';

  const countRows = await db.query(`
    SELECT COUNT(*) AS total_rows
    FROM dbo.PJ_TB_USERS u WITH (NOLOCK)
    ${whereSql}
  `);
  const pager = buildPager({ totalRows: countRows?.[0]?.total_rows, page, pageSize });

  const users = await db.query(`
    SELECT
      u.id,
      u.provider,
      u.login_id,
      u.email,
      u.user_name,
      u.token_balance,
      u.created_at,
      u.updated_at,
      (
        SELECT TOP 1 p.requested_at
        FROM dbo.PJ_TB_PAYMENTS p WITH (NOLOCK)
        WHERE p.login_id = u.login_id
        ORDER BY p.payment_id DESC
      ) AS last_payment_at,
      (
        SELECT COUNT(*)
        FROM dbo.PJ_TB_PAYMENTS p WITH (NOLOCK)
        WHERE p.login_id = u.login_id
          AND p.status = 'SUCCESS'
      ) AS success_payment_count
    FROM dbo.PJ_TB_USERS u WITH (NOLOCK)
    ${whereSql}
    ORDER BY u.id DESC
    OFFSET ${pager.offset} ROWS FETCH NEXT ${pager.pageSize} ROWS ONLY
  `);

  return {
    keyword: q,
    pager,
    users: (Array.isArray(users) ? users : []).map((row) => ({
      ...row,
      created_at_kst: formatKstDateTime(row.created_at),
      updated_at_kst: formatKstDateTime(row.updated_at),
      last_payment_at_kst: formatKstDateTime(row.last_payment_at),
    })),
  };
}

async function loadPromptTemplate({ serviceCode, featureKey, toneKey }) {
  const qService = db.convertQ(serviceCode);
  const qFeature = db.convertQ(featureKey || '');
  const qTone = db.convertQ(toneKey || '');
  const rs = await db.query(`
    SELECT TOP 1
      prompt_no,
      service_code,
      feature_key,
      tone_key,
      system_prompt,
      user_prompt_guide,
      updated_at
    FROM dbo.PJ_TB_PROMPT_TEMPLATES WITH (NOLOCK)
    WHERE service_code = '${qService}'
      AND ISNULL(feature_key, '') = '${qFeature}'
      AND ISNULL(tone_key, '') = '${qTone}'
      AND is_active = 1
    ORDER BY updated_at DESC, prompt_no DESC
  `);
  return rs && rs[0] ? rs[0] : null;
}

async function loadSajuTonePromptMap() {
  const tones = {};
  for (const tone of PROMPT_TONE_OPTIONS) {
    const row = await loadPromptTemplate({
      serviceCode: 'SAJU_TONE',
      featureKey: '',
      toneKey: tone.key,
    });
    tones[tone.key] = String(row?.system_prompt || '').trim();
  }
  return tones;
}

const promptsPage = async (req, res) => {
  try {
    const manageAdmin = await loadCurrentManageAdmin(req);
    const scopeKey = normalizePromptScope(req.query?.scope);
    const scopeMeta = getPromptScopeMeta(scopeKey);
    const serviceCode = scopeMeta.serviceCode;
    const featureKey = scopeMeta.featureKey;
    const toneKey = '';
    const row = await loadPromptTemplate({ serviceCode, featureKey, toneKey });
    const defaultSystemPrompt = buildDefaultSystemPromptByScope(serviceCode, featureKey, toneKey);
    const systemPrompt = String(row?.system_prompt || '').trim() || defaultSystemPrompt;
    const userPromptGuide = String(row?.user_prompt_guide || '').trim();
    const tonePromptMap = serviceCode === 'SAJU_TONE'
      ? await loadSajuTonePromptMap()
      : {};
    const defaultTonePromptMap = {};
    if (serviceCode === 'SAJU_TONE') {
      const defaults = loadPromptFileDefaults();
      PROMPT_TONE_OPTIONS.forEach((tone) => {
        defaultTonePromptMap[tone.key] = String(defaults.sajuTypes[tone.key] || '').trim();
        if (!tonePromptMap[tone.key]) tonePromptMap[tone.key] = defaultTonePromptMap[tone.key];
      });
    }

    return res.render('manage/pages/prompts', {
      layout: false,
      title: '48LAB Manage Prompts',
      manageAdmin,
      activeMain: 'admin',
      activeSub: 'prompts',
      scopeKey,
      serviceCode,
      featureKey,
      promptMeta: {
        scopeOptions: PROMPT_SCOPE_OPTIONS,
        toneOptions: PROMPT_TONE_OPTIONS,
      },
      promptData: {
        promptNo: Number(row?.prompt_no || 0),
        updatedAtKst: formatKstDateTime(row?.updated_at),
        systemPrompt,
        userPromptGuide,
        defaultSystemPrompt,
        applyScopeText: serviceCode === 'SAJU_TONE'
          ? '상담톤은 모든 서비스에서 공통으로 참조됩니다.'
          : serviceCode === 'SAJU'
          ? '사주 공통 시스템 프롬프트입니다. 상담톤은 "상담톤" 메뉴에서 별도 관리합니다.'
          : '현재 선택한 운세 서비스에만 적용됩니다.',
        tonePromptMap,
        defaultTonePromptMap,
      },
      noticeMessage: getPromptPageNoticeMessage(req.query?.notice),
      errorMessage: getPromptPageErrorMessage(req.query?.error),
    });
  } catch (err) {
    console.error('[MANAGE PROMPTS PAGE ERROR]', err.message);
    return res.redirect('/manage');
  }
};

const savePrompt = async (req, res) => {
  const scopeKey = normalizePromptScope(req.body?.scope_key);
  const scopeMeta = getPromptScopeMeta(scopeKey);
  const serviceCode = scopeMeta.serviceCode;
  const featureKey = scopeMeta.featureKey;
  const redirectBase = `/manage/prompts?scope=${encodeURIComponent(scopeKey)}`;

  try {
    const manageAdmin = req.session?.manageAdmin || {};
    const adminId = String(manageAdmin.admin_id || '').trim();
    if (!adminId) return res.redirect('/manage/login');

    const systemPrompt = String(req.body?.system_prompt || '').trim();
    const userPromptGuide = String(req.body?.user_prompt_guide || '').trim();
    if (serviceCode !== 'SAJU_TONE' && !systemPrompt) {
      return res.redirect(`${redirectBase}&error=required`);
    }

    const qService = db.convertQ(serviceCode);
    const qFeature = db.convertQ(featureKey);
    const qSystemPrompt = db.convertQ(systemPrompt);
    const qUserPromptGuide = db.convertQ(userPromptGuide);
    const qAdminId = db.convertQ(adminId);
    const toneScopes = [''];
    let totalAffected = 0;

    if (serviceCode === 'SAJU_TONE') {
      for (const tone of PROMPT_TONE_OPTIONS) {
        const toneScope = tone.key;
        const tonePromptRaw = String(req.body?.[`tone_prompt_${toneScope}`] || '').trim();
        if (!tonePromptRaw) {
          return res.redirect(`${redirectBase}&error=required`);
        }
        const qTone = db.convertQ(toneScope);
        const qTonePrompt = db.convertQ(tonePromptRaw);
        const toneSave = await db.query(`
          EXEC dbo.PJ_USP_SAVE_PROMPT_TEMPLATE
            @service_code='SAJU_TONE',
            @feature_key='',
            @tone_key='${qTone}',
            @system_prompt=N'${qTonePrompt}',
            @user_prompt_guide=N'',
            @updated_by='${qAdminId}'
        `);
        const toneRow = toneSave?.[0] || {};
        if (String(toneRow.resp || '').toUpperCase() !== 'OK') {
          await writeManageActionLog(req, {
            actionCode: 'PROMPT_TEMPLATE_SAVE',
            targetType: 'PROMPT',
            targetId: `SAJU_TONE:${toneScope}`,
            resultStatus: 'FAILED',
            requestData: { scopeKey, toneScope },
            responseData: { reason: toneRow.resp_message || 'TONE_NOT_UPDATED' },
          });
          return res.redirect(`${redirectBase}&error=failed`);
        }
        totalAffected += Number(toneRow.affected || 0);
      }
    } else {
      for (const toneScope of toneScopes) {
        const qTone = db.convertQ(toneScope);
        const rs = await db.query(`
          EXEC dbo.PJ_USP_SAVE_PROMPT_TEMPLATE
            @service_code='${qService}',
            @feature_key='${qFeature}',
            @tone_key='${qTone}',
            @system_prompt=N'${qSystemPrompt}',
            @user_prompt_guide=N'${qUserPromptGuide}',
            @updated_by='${qAdminId}'
        `);
        const row = rs?.[0] || {};
        if (String(row.resp || '').toUpperCase() !== 'OK') {
          await writeManageActionLog(req, {
            actionCode: 'PROMPT_TEMPLATE_SAVE',
            targetType: 'PROMPT',
            targetId: `${scopeKey}:${toneScope || '-'}`,
            resultStatus: 'FAILED',
            requestData: { scopeKey, serviceCode, featureKey, toneScope },
            responseData: { reason: row.resp_message || 'NOT_UPDATED' },
          });
          return res.redirect(`${redirectBase}&error=failed`);
        }
        totalAffected += Number(row.affected || 0);
      }
    }

    clearPromptTemplateCache();
    await writeManageActionLog(req, {
      actionCode: 'PROMPT_TEMPLATE_SAVE',
      targetType: 'PROMPT',
      targetId: `${scopeKey}:${serviceCode === 'SAJU_TONE' ? 'ALL_TONES' : '-'}`,
      resultStatus: 'SUCCESS',
      requestData: {
        scopeKey,
        serviceCode,
        featureKey,
        toneScopes: serviceCode === 'SAJU_TONE' ? PROMPT_TONE_OPTIONS.map((it) => it.key) : toneScopes,
        systemLength: systemPrompt.length,
        guideLength: userPromptGuide.length,
      },
      responseData: { affected: totalAffected },
    });
    return res.redirect(`${redirectBase}&notice=saved`);
  } catch (err) {
    console.error('[MANAGE PROMPT SAVE ERROR]', err.message);
    await writeManageActionLog(req, {
      actionCode: 'PROMPT_TEMPLATE_SAVE',
      targetType: 'PROMPT',
      targetId: `${scopeKey}:${serviceCode === 'SAJU_TONE' ? 'ALL_TONES' : '-'}`,
      resultStatus: 'FAILED',
      requestData: { scopeKey, serviceCode, featureKey },
      responseData: { error: err.message || 'PROMPT SAVE FAILED' },
    });
    return res.redirect(`${redirectBase}&error=failed`);
  }
};

const loginPage = (req, res) => {
  const next = normalizeNextPath(req.query?.next);
  const error = String(req.query?.error || '').trim().toLowerCase();
  const errorMessage = error === 'invalid'
    ? '아이디 또는 비밀번호가 올바르지 않습니다.'
    : error === 'disabled'
      ? '비활성화된 관리자 계정입니다.'
      : '';

  return res.render('manage/pages/login', {
    layout: false,
    title: '48LAB Manage Login',
    next,
    errorMessage,
  });
};

const login = async (req, res) => {
  try {
    const adminId = String(req.body?.admin_id || '').trim();
    const password = String(req.body?.password || '');
    const next = normalizeNextPath(req.body?.next || req.query?.next);
    if (!adminId || !password) {
      return res.redirect(`/manage/login?error=invalid&next=${encodeURIComponent(next)}`);
    }

    const qAdminId = db.convertQ(adminId);
    const passwordHash = hashManagePassword(password);
    const qPasswordHash = db.convertQ(passwordHash);
    const query = `
      EXEC dbo.PJ_USP_MANAGE_ADMIN_LOGIN
        @admin_id = '${qAdminId}',
        @password_hash = '${qPasswordHash}'
    `;
    const rs = await db.query(query);
    const row = rs && rs[0] ? rs[0] : {};
    const resp = String(row.resp || 'ERROR').toUpperCase();
    if (resp !== 'OK') {
      const reason = String(row.resp_message || '').toUpperCase();
      const code = reason === 'ADMIN DISABLED' ? 'disabled' : 'invalid';
      return res.redirect(`/manage/login?error=${code}&next=${encodeURIComponent(next)}`);
    }

    req.session.manageAdmin = {
      admin_id: String(row.admin_id || adminId),
      admin_name: String(row.admin_name || '관리자'),
      at: Date.now(),
    };

    return req.session.save((err) => {
      if (err) return res.redirect('/manage/login?error=invalid');
      return res.redirect(next);
    });
  } catch (err) {
    console.error('[MANAGE LOGIN ERROR]', err.message);
    return res.redirect('/manage/login?error=invalid');
  }
};

const dashboard = async (req, res) => {
  try {
    const manageAdmin = await loadCurrentManageAdmin(req);
    const summary = await loadDashboardSummary();
    return res.render('manage/pages/dashboard', {
      layout: false,
      title: '48LAB Manage Dashboard',
      manageAdmin,
      activeMain: 'operations',
      activeSub: 'dashboard',
      summary,
    });
  } catch (err) {
    console.error('[MANAGE DASHBOARD ERROR]', err.message);
    return res.redirect('/manage/info');
  }
};

const callMonitoringPage = async (req, res) => {
  try {
    const manageAdmin = await loadCurrentManageAdmin(req);
    const page = parsePositiveInt(req.query?.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query?.page_size, 20, 100);
    const monitoring = await loadCallMonitoring({ page, pageSize });
    return res.render('manage/pages/monitoring_calls', {
      layout: false,
      title: '48LAB Manage Calls',
      manageAdmin,
      activeMain: 'monitoring',
      activeSub: 'calls',
      monitoring,
    });
  } catch (err) {
    console.error('[MANAGE CALL MONITORING ERROR]', err.message);
    return res.redirect('/manage');
  }
};

const tokenMonitoringPage = async (req, res) => {
  try {
    const manageAdmin = await loadCurrentManageAdmin(req);
    const tokenMetrics = await loadTokenMonitoring();
    return res.render('manage/pages/monitoring_tokens', {
      layout: false,
      title: '48LAB Manage Tokens',
      manageAdmin,
      activeMain: 'monitoring',
      activeSub: 'tokens',
      tokenMetrics,
    });
  } catch (err) {
    console.error('[MANAGE TOKEN MONITORING ERROR]', err.message);
    return res.redirect('/manage');
  }
};

const usersPage = async (req, res) => {
  try {
    const manageAdmin = await loadCurrentManageAdmin(req);
    const keyword = String(req.query?.q || '').trim();
    const page = parsePositiveInt(req.query?.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query?.page_size, 20, 100);
    const userList = await loadUserList({ keyword, page, pageSize });
    return res.render('manage/pages/users', {
      layout: false,
      title: '48LAB Manage Users',
      manageAdmin,
      activeMain: 'members',
      activeSub: 'users',
      userList,
    });
  } catch (err) {
    console.error('[MANAGE USERS PAGE ERROR]', err.message);
    return res.redirect('/manage');
  }
};

const userDetailApi = async (req, res) => {
  try {
    const loginId = String(req.params?.loginId || '').trim();
    if (!loginId) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'LOGIN_ID REQUIRED' });
    }
    const qLoginId = db.convertQ(loginId);

    const [userRows, paymentRows, ledgerRows] = await Promise.all([
      db.query(`
        SELECT TOP 1
          id,
          provider,
          login_id,
          email,
          user_name,
          token_balance,
          created_at,
          updated_at
        FROM dbo.PJ_TB_USERS WITH (NOLOCK)
        WHERE login_id = '${qLoginId}'
      `),
      db.query(`
        EXEC dbo.PJ_USP_SELECT_PAYMENT_HISTORY_BY_LOGIN_ID
          @login_id='${qLoginId}',
          @top_n=20
      `),
      db.query(`
        EXEC dbo.PJ_USP_SELECT_TOKEN_LEDGER_BY_LOGIN_ID
          @login_id='${qLoginId}',
          @top_n=30
      `),
    ]);

    const user = userRows?.[0];
    if (!user) {
      return res.status(404).json({ resp: 'ERROR', resp_message: 'USER NOT FOUND' });
    }

    const payments = Array.isArray(paymentRows) ? paymentRows : [];
    const ledger = Array.isArray(ledgerRows) ? ledgerRows : [];

    return res.json({
      resp: 'OK',
      user: {
        ...user,
        created_at_kst: formatKstDateTime(user.created_at),
        updated_at_kst: formatKstDateTime(user.updated_at),
      },
      payments: payments.map((p) => ({
        ...p,
        requested_at_kst: formatKstDateTime(p.requested_at),
        approved_at_kst: formatKstDateTime(p.approved_at),
      })),
      ledger: ledger.map((l) => ({
        ...l,
        created_at_kst: formatKstDateTime(l.created_at),
      })),
    });
  } catch (err) {
    console.error('[MANAGE USER DETAIL API ERROR]', err.message);
    return res.status(500).json({ resp: 'ERROR', resp_message: 'DETAIL LOAD FAILED' });
  }
};

const grantUserTokenApi = async (req, res) => {
  try {
    const loginId = String(req.params?.loginId || '').trim();
    const amount = parsePositiveInt(req.body?.amount, 0, 100000000);
    const eventCode = normalizeEventCode(req.body?.event_code);
    const memo = String(req.body?.memo || '').trim();
    if (!loginId || amount <= 0) {
      return res.status(400).json({ resp: 'ERROR', resp_message: 'INVALID INPUT' });
    }

    const qLoginId = db.convertQ(loginId);
    const qEventCode = db.convertQ(eventCode);
    const qMemo = db.convertQ(memo || `관리자 수동 지급 (${eventCode})`);

    const rs = await db.query(`
      EXEC dbo.PJ_USP_GRANT_EVENT_TOKEN
        @login_id='${qLoginId}',
        @amount=${amount},
        @event_code='${qEventCode}',
        @memo=N'${qMemo}'
    `);
    const row = rs?.[0] || {};
    if (String(row.resp || '').toUpperCase() !== 'OK') {
      await writeManageActionLog(req, {
        actionCode: 'USER_TOKEN_GRANT',
        targetType: 'USER',
        targetId: loginId,
        resultStatus: 'FAILED',
        requestData: { login_id: loginId, amount, event_code: eventCode, memo },
        responseData: { resp: row.resp || 'ERROR', resp_message: row.resp_message || 'TOKEN GRANT FAILED' },
      });
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: row.resp_message || 'TOKEN GRANT FAILED',
      });
    }

    await writeManageActionLog(req, {
      actionCode: 'USER_TOKEN_GRANT',
      targetType: 'USER',
      targetId: String(row.login_id || loginId),
      resultStatus: 'SUCCESS',
      requestData: { login_id: loginId, amount, event_code: eventCode, memo },
      responseData: {
        resp: 'OK',
        current_tokens: toNumber(row.current_tokens),
        granted_tokens: toNumber(row.granted_tokens),
      },
    });

    return res.json({
      resp: 'OK',
      resp_message: row.resp_message || 'EVENT TOKEN GRANTED',
      login_id: row.login_id || loginId,
      current_tokens: toNumber(row.current_tokens),
      granted_tokens: toNumber(row.granted_tokens),
    });
  } catch (err) {
    console.error('[MANAGE GRANT TOKEN API ERROR]', err.message);
    await writeManageActionLog(req, {
      actionCode: 'USER_TOKEN_GRANT',
      targetType: 'USER',
      targetId: String(req.params?.loginId || '').trim(),
      resultStatus: 'FAILED',
      requestData: {
        login_id: String(req.params?.loginId || '').trim(),
        amount: parsePositiveInt(req.body?.amount, 0, 100000000),
        event_code: normalizeEventCode(req.body?.event_code),
      },
      responseData: { error: err.message || 'TOKEN GRANT FAILED' },
    });
    return res.status(500).json({ resp: 'ERROR', resp_message: 'TOKEN GRANT FAILED' });
  }
};

const infoPage = async (req, res) => {
  try {
    const manageAdmin = await loadCurrentManageAdmin(req);
    return res.render('manage/pages/info', {
      layout: false,
      title: '48LAB Manage Info',
      manageAdmin,
      activeMain: 'admin',
      activeSub: 'info',
      errorMessage: getInfoPageErrorMessage(req.query?.error),
      noticeMessage: getInfoPageNoticeMessage(req.query?.notice),
    });
  } catch (err) {
    console.error('[MANAGE INFO PAGE ERROR]', err.message);
    return res.redirect('/manage');
  }
};

const updateInfo = async (req, res) => {
  try {
    const manageAdmin = req.session?.manageAdmin || {};
    const adminId = String(manageAdmin.admin_id || '').trim();
    if (!adminId) return res.redirect('/manage/login');

    const adminName = String(req.body?.admin_name || '').trim();
    if (!adminName) {
      return res.redirect('/manage/info?error=required');
    }

    const qAdminId = db.convertQ(adminId);
    const qAdminName = db.convertQ(adminName);
    const rs = await db.query(`
      UPDATE dbo.PJ_TB_MANAGE_ADMINS
      SET
        admin_name = N'${qAdminName}',
        updated_at = SYSDATETIME()
      WHERE admin_id = '${qAdminId}'
        AND is_active = 1;
      SELECT @@ROWCOUNT AS affected;
    `);
    const affected = Number(rs?.[0]?.affected || 0);
    if (affected <= 0) {
      await writeManageActionLog(req, {
        actionCode: 'ADMIN_INFO_UPDATE',
        targetType: 'ADMIN',
        targetId: adminId,
        resultStatus: 'FAILED',
        requestData: { admin_name: adminName },
        responseData: { reason: 'NOT_UPDATED' },
      });
      return res.redirect('/manage/info?error=failed');
    }

    req.session.manageAdmin = {
      ...manageAdmin,
      admin_name: adminName,
    };

    await writeManageActionLog(req, {
      actionCode: 'ADMIN_INFO_UPDATE',
      targetType: 'ADMIN',
      targetId: adminId,
      resultStatus: 'SUCCESS',
      requestData: { admin_name: adminName },
      responseData: { affected },
    });

    return req.session.save(() => res.redirect('/manage/info?notice=changed'));
  } catch (err) {
    console.error('[MANAGE INFO UPDATE ERROR]', err.message);
    await writeManageActionLog(req, {
      actionCode: 'ADMIN_INFO_UPDATE',
      targetType: 'ADMIN',
      targetId: String(req.session?.manageAdmin?.admin_id || '').trim(),
      resultStatus: 'FAILED',
      requestData: { admin_name: String(req.body?.admin_name || '').trim() },
      responseData: { error: err.message || 'INFO UPDATE FAILED' },
    });
    return res.redirect('/manage/info?error=failed');
  }
};

const passwordPage = async (req, res) => {
  const manageAdmin = await loadCurrentManageAdmin(req);
  return res.render('manage/pages/password', {
    layout: false,
    title: '48LAB Manage Password',
    manageAdmin,
    activeMain: 'admin',
    activeSub: 'password',
    errorMessage: getPasswordPageErrorMessage(req.query?.error),
    noticeMessage: getPasswordPageNoticeMessage(req.query?.notice),
  });
};

const changePassword = async (req, res) => {
  try {
    const admin = req.session?.manageAdmin || {};
    const adminId = String(admin.admin_id || '').trim();
    if (!adminId) return res.redirect('/manage/login');

    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    const confirmPassword = String(req.body?.confirm_password || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect('/manage/password?error=required');
    }
    if (newPassword.length < 8) {
      return res.redirect('/manage/password?error=weak');
    }
    if (newPassword !== confirmPassword) {
      return res.redirect('/manage/password?error=mismatch');
    }

    const currentHash = hashManagePassword(currentPassword);
    const newHash = hashManagePassword(newPassword);
    if (currentHash === newHash) {
      return res.redirect('/manage/password?error=same');
    }

    const qAdminId = db.convertQ(adminId);
    const qCurrentHash = db.convertQ(currentHash);
    const qNewHash = db.convertQ(newHash);

    const rs = await db.query(`
      UPDATE dbo.PJ_TB_MANAGE_ADMINS
      SET
        password_hash = '${qNewHash}',
        updated_at = SYSDATETIME()
      WHERE admin_id = '${qAdminId}'
        AND is_active = 1
        AND password_hash = '${qCurrentHash}';
      SELECT @@ROWCOUNT AS affected;
    `);
    const affected = Number(rs?.[0]?.affected || 0);
    if (affected <= 0) {
      await writeManageActionLog(req, {
        actionCode: 'ADMIN_PASSWORD_CHANGE',
        targetType: 'ADMIN',
        targetId: adminId,
        resultStatus: 'FAILED',
        requestData: { has_current_password: true, new_password_length: newPassword.length },
        responseData: { reason: 'INVALID_CURRENT_PASSWORD' },
      });
      return res.redirect('/manage/password?error=invalid_current');
    }

    await writeManageActionLog(req, {
      actionCode: 'ADMIN_PASSWORD_CHANGE',
      targetType: 'ADMIN',
      targetId: adminId,
      resultStatus: 'SUCCESS',
      requestData: { has_current_password: true, new_password_length: newPassword.length },
      responseData: { affected },
    });

    return res.redirect('/manage/info?notice=changed');
  } catch (err) {
    console.error('[MANAGE PASSWORD CHANGE ERROR]', err.message);
    await writeManageActionLog(req, {
      actionCode: 'ADMIN_PASSWORD_CHANGE',
      targetType: 'ADMIN',
      targetId: String(req.session?.manageAdmin?.admin_id || '').trim(),
      resultStatus: 'FAILED',
      requestData: { has_current_password: Boolean(req.body?.current_password) },
      responseData: { error: err.message || 'PASSWORD CHANGE FAILED' },
    });
    return res.redirect('/manage/password?error=failed');
  }
};

const logout = (req, res) => {
  if (!req.session) return res.redirect('/manage/login');
  delete req.session.manageAdmin;
  return req.session.save(() => res.redirect('/manage/login'));
};

module.exports = {
  loginPage,
  login,
  dashboard,
  callMonitoringPage,
  tokenMonitoringPage,
  usersPage,
  promptsPage,
  savePrompt,
  userDetailApi,
  grantUserTokenApi,
  infoPage,
  updateInfo,
  passwordPage,
  changePassword,
  logout,
};
