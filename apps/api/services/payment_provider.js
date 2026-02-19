const axios = require('axios');
const { buildAppUrl } = require('../../core/utils/url');

function normalizeText(v) {
  return String(v || '').trim();
}

function formatProviderError(err, prefix) {
  const data = err?.response?.data;
  if (!data) return `${prefix}: ${err.message}`;

  const detail = Array.isArray(data.details) && data.details[0]
    ? `${data.details[0].issue || ''} ${data.details[0].description || ''}`.trim()
    : '';

  return `${prefix}: ${data.name || 'API_ERROR'}${detail ? ` - ${detail}` : ''}`;
}

function buildCallbackUrls(req, provider, paymentId) {
  const p = provider.toLowerCase();
  return {
    returnUrl: `${buildAppUrl(req, `/api/payments/callback/${p}`)}?payment_id=${paymentId}`,
    cancelUrl: `${buildAppUrl(req, `/api/payments/callback/${p}/cancel`)}?payment_id=${paymentId}`,
    failUrl: `${buildAppUrl(req, `/api/payments/callback/${p}/fail`)}?payment_id=${paymentId}`,
  };
}

async function createKakaoPayReady({ req, paymentId, loginId, amountKrw, itemName }) {
  const cid = normalizeText(process.env.KAKAOPAY_CID);
  const secret = normalizeText(process.env.KAKAOPAY_SECRET_KEY);
  const url = normalizeText(process.env.KAKAOPAY_READY_URL);
  if (!cid || !secret || !url) {
    throw new Error('KAKAOPAY ENV NOT CONFIGURED');
  }

  const cb = buildCallbackUrls(req, 'kakaopay', paymentId);
  const payload = {
    cid,
    partner_order_id: `48LAB-${paymentId}`,
    partner_user_id: loginId,
    item_name: itemName || '토큰 충전',
    quantity: 1,
    total_amount: amountKrw,
    tax_free_amount: 0,
    approval_url: cb.returnUrl,
    cancel_url: cb.cancelUrl,
    fail_url: cb.failUrl,
  };

  const { data } = await axios.post(url, payload, {
    headers: {
      Authorization: `SECRET_KEY ${secret}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    provider: 'KAKAOPAY',
    providerTxnId: normalizeText(data.tid),
    redirectUrl: normalizeText(data.next_redirect_pc_url || data.next_redirect_mobile_url),
    raw: data,
  };
}

async function approveKakaoPay({ payment, query }) {
  const cid = normalizeText(process.env.KAKAOPAY_CID);
  const secret = normalizeText(process.env.KAKAOPAY_SECRET_KEY);
  const url = normalizeText(process.env.KAKAOPAY_APPROVE_URL);
  const pgToken = normalizeText(query.pg_token);
  if (!cid || !secret || !url) throw new Error('KAKAOPAY ENV NOT CONFIGURED');
  if (!pgToken) throw new Error('KAKAOPAY PG_TOKEN REQUIRED');

  const requestPayload = payment.request_payload ? JSON.parse(payment.request_payload) : {};
  const partnerOrderId = normalizeText(requestPayload.merchant_order_id || `48LAB-${payment.payment_id}`);

  const payload = {
    cid,
    tid: payment.provider_txn_id,
    partner_order_id: partnerOrderId,
    partner_user_id: payment.login_id,
    pg_token: pgToken,
  };

  const { data } = await axios.post(url, payload, {
    headers: {
      Authorization: `SECRET_KEY ${secret}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    providerTxnId: normalizeText(data.tid || payment.provider_txn_id),
    approvedPayload: data,
  };
}

async function createNaverPayReady({ req, paymentId, amountKrw, itemName }) {
  const clientId = normalizeText(process.env.NAVERPAY_CLIENT_ID);
  const clientSecret = normalizeText(process.env.NAVERPAY_CLIENT_SECRET);
  const chainId = normalizeText(process.env.NAVERPAY_CHAIN_ID);
  const url = normalizeText(process.env.NAVERPAY_READY_URL);
  if (!clientId || !clientSecret || !chainId || !url) {
    throw new Error('NAVERPAY ENV NOT CONFIGURED');
  }

  const cb = buildCallbackUrls(req, 'naverpay', paymentId);
  const payload = {
    merchantPayKey: `48LAB-${paymentId}`,
    productName: itemName || '토큰 충전',
    totalPayAmount: amountKrw,
    taxScopeAmount: amountKrw,
    taxExScopeAmount: 0,
    returnUrl: cb.returnUrl,
    cancelUrl: cb.cancelUrl,
  };

  const { data } = await axios.post(url, payload, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
      'X-NaverPay-Chain-Id': chainId,
      'Content-Type': 'application/json',
    },
  });

  return {
    provider: 'NAVERPAY',
    providerTxnId: normalizeText(data.paymentId || data.reserveId || data.payKey),
    redirectUrl: normalizeText(data.forwardUrl || data.paymentUrl),
    raw: data,
  };
}

async function approveNaverPay({ payment, query }) {
  const clientId = normalizeText(process.env.NAVERPAY_CLIENT_ID);
  const clientSecret = normalizeText(process.env.NAVERPAY_CLIENT_SECRET);
  const chainId = normalizeText(process.env.NAVERPAY_CHAIN_ID);
  const url = normalizeText(process.env.NAVERPAY_APPROVE_URL);
  if (!clientId || !clientSecret || !chainId || !url) {
    throw new Error('NAVERPAY ENV NOT CONFIGURED');
  }

  const paymentId = normalizeText(query.paymentId || payment.provider_txn_id);
  if (!paymentId) throw new Error('NAVERPAY PAYMENT_ID REQUIRED');

  const payload = {
    paymentId,
  };

  const { data } = await axios.post(url, payload, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
      'X-NaverPay-Chain-Id': chainId,
      'Content-Type': 'application/json',
    },
  });

  return {
    providerTxnId: paymentId,
    approvedPayload: data,
  };
}

async function getPayPalAccessToken() {
  const clientId = normalizeText(process.env.PAYPAL_CLIENT_ID);
  const clientSecret = normalizeText(process.env.PAYPAL_CLIENT_SECRET);
  const tokenUrl = normalizeText(process.env.PAYPAL_TOKEN_URL);
  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error('PAYPAL ENV NOT CONFIGURED');
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');

  const { data } = await axios.post(tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    auth: {
      username: clientId,
      password: clientSecret,
    },
  });

  return normalizeText(data.access_token);
}

async function createPayPalReady({ req, paymentId, amountKrw, tokenAmount }) {
  const createUrl = normalizeText(process.env.PAYPAL_CREATE_ORDER_URL);
  if (!createUrl) throw new Error('PAYPAL ENV NOT CONFIGURED');

  const accessToken = await getPayPalAccessToken();
  const cb = buildCallbackUrls(req, 'paypal', paymentId);
  const currency = normalizeText(process.env.PAYPAL_CURRENCY || 'USD').toUpperCase();
  const fxKrwPerUnit = Number(process.env.PAYPAL_FX_KRW_PER_UNIT || 1400);
  const amountValue = (() => {
    if (currency === 'KRW') return String(Math.max(1, Math.round(amountKrw)));
    const converted = Number(amountKrw || 0) / (fxKrwPerUnit > 0 ? fxKrwPerUnit : 1400);
    return Math.max(0.01, Math.round(converted * 100) / 100).toFixed(2);
  })();

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: String(paymentId),
        description: `48LAB TOKEN ${tokenAmount}`,
        custom_id: `AMOUNT_KRW:${amountKrw}`,
        amount: {
          currency_code: currency,
          value: amountValue,
        },
      },
    ],
    application_context: {
      return_url: cb.returnUrl,
      cancel_url: cb.cancelUrl,
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
    },
  };

  let data;
  try {
    const resp = await axios.post(createUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    data = resp.data;
  } catch (err) {
    throw new Error(formatProviderError(err, 'PAYPAL_CREATE_ORDER_FAILED'));
  }

  const approveLink = Array.isArray(data.links)
    ? data.links.find((v) => String(v.rel || '').toLowerCase() === 'approve')
    : null;

  return {
    provider: 'PAYPAL',
    providerTxnId: normalizeText(data.id),
    redirectUrl: normalizeText(approveLink?.href),
    raw: data,
  };
}

async function approvePayPal({ payment, query }) {
  const captureUrlTemplate = normalizeText(process.env.PAYPAL_CAPTURE_ORDER_URL);
  if (!captureUrlTemplate) throw new Error('PAYPAL ENV NOT CONFIGURED');

  const token = await getPayPalAccessToken();
  const orderId = normalizeText(query.token || payment.provider_txn_id);
  if (!orderId) throw new Error('PAYPAL ORDER TOKEN REQUIRED');

  const captureUrl = captureUrlTemplate.replace('{order_id}', orderId);
  let data;
  try {
    const resp = await axios.post(captureUrl, {}, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    data = resp.data;
  } catch (err) {
    throw new Error(formatProviderError(err, 'PAYPAL_CAPTURE_FAILED'));
  }

  return {
    providerTxnId: orderId,
    approvedPayload: data,
  };
}

async function createProviderPayment(params) {
  const { provider } = params;
  if (provider === 'KAKAOPAY') return createKakaoPayReady(params);
  if (provider === 'NAVERPAY') return createNaverPayReady(params);
  if (provider === 'PAYPAL') return createPayPalReady(params);
  throw new Error('UNSUPPORTED PROVIDER');
}

async function approveProviderPayment({ payment, query }) {
  if (payment.provider === 'KAKAOPAY') return approveKakaoPay({ payment, query });
  if (payment.provider === 'NAVERPAY') return approveNaverPay({ payment, query });
  if (payment.provider === 'PAYPAL') return approvePayPal({ payment, query });
  throw new Error('UNSUPPORTED PROVIDER');
}

module.exports = {
  createProviderPayment,
  approveProviderPayment,
};
