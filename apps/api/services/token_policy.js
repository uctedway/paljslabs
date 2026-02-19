const { TOKEN_PACKAGES } = require('./token_constants');

const ALLOWED_PAYMENT_PROVIDERS = ['KAKAOPAY', 'NAVERPAY', 'PAYPAL'];

function normalizeProvider(value) {
  const provider = String(value || '').trim().toUpperCase();
  return ALLOWED_PAYMENT_PROVIDERS.includes(provider) ? provider : '';
}

function normalizeAmount(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function resolvePaymentPackage(amountKrw) {
  const amount = normalizeAmount(amountKrw);
  const tokens = TOKEN_PACKAGES[amount] || 0;
  return {
    amountKrw: amount,
    tokens,
    supported: tokens > 0,
  };
}

module.exports = {
  TOKEN_PACKAGES,
  ALLOWED_PAYMENT_PROVIDERS,
  normalizeProvider,
  normalizeAmount,
  resolvePaymentPackage,
};
