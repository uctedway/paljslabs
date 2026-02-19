function normalizeText(v) {
  return String(v || '').trim();
}

function firstCsvToken(v) {
  return normalizeText(v).split(',')[0].trim();
}

function normalizeBasePath(raw) {
  const value = normalizeText(raw);
  if (!value || value === '/') return '';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.replace(/\/+$/, '');
}

function normalizeRelativePath(rawPath) {
  const value = normalizeText(rawPath);
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

function getAppOrigin(req) {
  const proto = firstCsvToken(req?.headers?.['x-forwarded-proto']) || req?.protocol || 'http';
  const host = firstCsvToken(req?.headers?.['x-forwarded-host']) || req?.get?.('host') || 'localhost:3000';
  const requestOrigin = `${proto}://${host}`;

  if (String(process.env.NODE_ENV || 'development') !== 'production') {
    return requestOrigin;
  }

  const fromEnv = normalizeText(process.env.APP_ORIGIN);
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  return requestOrigin;
}

function getAppBasePath() {
  return normalizeBasePath(process.env.APP_BASE_PATH);
}

function buildAppUrl(req, relativePath = '/') {
  const origin = getAppOrigin(req);
  const basePath = getAppBasePath();
  const path = normalizeRelativePath(relativePath);
  return `${origin}${basePath}${path}`;
}

module.exports = {
  getAppOrigin,
  getAppBasePath,
  buildAppUrl,
};
