const {
  normalizeProvider,
  resolvePaymentPackage,
} = require('../services/token_policy');
const {
  createPaymentRequest,
  getPaymentById,
  updatePaymentPending,
  confirmPaymentSuccess,
  markPaymentFailed,
  markPaymentCanceled,
} = require('../services/payment_store');
const {
  getTokenSummary,
  grantEventToken,
} = require('../services/token_wallet');
const {
  createProviderPayment,
  approveProviderPayment,
} = require('../services/payment_provider');

function getSessionLoginId(req) {
  try {
    return String(req?.session?.user?.login_id || '');
  } catch (e) {
    return '';
  }
}

function getSessionUserName(req) {
  try {
    return String(req?.session?.user?.user_name || '');
  } catch (e) {
    return '';
  }
}

function parsePaymentId(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

exports.getTokenSummary = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    const loginId = getSessionLoginId(req);
    if (!loginId) {
      return res.status(401).json({
        resp: 'ERROR',
        resp_message: 'LOGIN_REQUIRED',
      });
    }

    const row = await getTokenSummary(loginId);
    const resp = String(row?.resp || 'ERROR').toUpperCase();
    if (resp !== 'OK') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: row?.resp_message || 'TOKEN SUMMARY FAILED',
      });
    }

    return res.json({
      resp: 'OK',
      login_id: row.login_id,
      current_tokens: Number(row.current_tokens || 0),
      ledger_net_tokens: Number(row.ledger_net_tokens || 0),
      sync_ok: Number(row.sync_ok || 0) === 1,
    });
  } catch (err) {
    console.error('[TOKEN SUMMARY API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'TOKEN_SUMMARY_FAILED',
    });
  }
};

exports.createPayment = async (req, res) => {
  try {
    const loginId = getSessionLoginId(req);
    if (!loginId) {
      return res.status(401).json({
        resp: 'ERROR',
        resp_message: 'LOGIN_REQUIRED',
      });
    }

    const provider = normalizeProvider(req.body?.provider);
    if (!provider) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID_PROVIDER',
        supported_providers: ['KAKAOPAY', 'NAVERPAY', 'PAYPAL'],
      });
    }

    const pack = resolvePaymentPackage(req.body?.amount_krw);
    if (!pack.supported) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'UNSUPPORTED_AMOUNT',
        supported_amounts: [1000, 3000, 5000, 10000, 100000],
      });
    }

    const requestPayload = {
      provider,
      amount_krw: pack.amountKrw,
      token_amount: pack.tokens,
      user_name: getSessionUserName(req),
      requested_from_ip: req.ip,
    };

    const created = await createPaymentRequest({
      loginId,
      provider,
      amountKrw: pack.amountKrw,
      tokenAmount: pack.tokens,
      requestPayload,
    });

    if (String(created?.resp || 'ERROR').toUpperCase() !== 'OK') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: created?.resp_message || 'PAYMENT_REQUEST_FAILED',
      });
    }

    const paymentId = Number(created.payment_id || 0);

    try {
      const ready = await createProviderPayment({
        req,
        paymentId,
        provider,
        loginId,
        amountKrw: pack.amountKrw,
        tokenAmount: pack.tokens,
        itemName: `토큰 ${pack.tokens}개`,
      });

      const pending = await updatePaymentPending({
        paymentId,
        providerTxnId: ready.providerTxnId,
        pendingPayload: ready.raw,
      });

      if (String(pending?.resp || 'ERROR').toUpperCase() !== 'OK') {
        return res.status(500).json({
          resp: 'ERROR',
          resp_message: pending?.resp_message || 'PAYMENT_PENDING_UPDATE_FAILED',
        });
      }

      return res.json({
        resp: 'OK',
        payment_id: paymentId,
        provider,
        amount_krw: pack.amountKrw,
        token_amount: pack.tokens,
        provider_txn_id: ready.providerTxnId,
        redirect_url: ready.redirectUrl,
      });
    } catch (providerErr) {
      await markPaymentFailed({
        paymentId,
        errorMessage: providerErr.message,
        failedPayload: { step: 'createProviderPayment', message: providerErr.message },
      });

      return res.status(502).json({
        resp: 'ERROR',
        resp_message: 'PAYMENT_PROVIDER_READY_FAILED',
        message: providerErr.message,
      });
    }
  } catch (err) {
    console.error('[PAYMENT CREATE API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'PAYMENT_CREATE_FAILED',
    });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.body?.payment_id || req.query?.payment_id);
    if (!paymentId) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'PAYMENT_ID_REQUIRED',
      });
    }

    const payment = await getPaymentById(paymentId);
    if (!payment || String(payment.resp || 'ERROR').toUpperCase() !== 'OK') {
      return res.status(404).json({
        resp: 'ERROR',
        resp_message: 'PAYMENT_NOT_FOUND',
      });
    }

    const sessionLoginId = getSessionLoginId(req);
    if (sessionLoginId && sessionLoginId !== String(payment.login_id || '')) {
      return res.status(403).json({
        resp: 'ERROR',
        resp_message: 'PAYMENT_OWNER_MISMATCH',
      });
    }

    const currentStatus = String(payment.status || '').toUpperCase();
    if (currentStatus === 'SUCCESS') {
      const summary = await getTokenSummary(String(payment.login_id || ''));
      return res.json({
        resp: 'OK',
        payment_id: Number(payment.payment_id || paymentId),
        login_id: payment.login_id,
        current_tokens: Number(summary?.current_tokens || 0),
        granted_tokens: 0,
      });
    }

    if (currentStatus === 'FAILED' || currentStatus === 'CANCELED') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: `PAYMENT_STATUS_${currentStatus}`,
      });
    }

    const approved = await approveProviderPayment({
      payment,
      query: req.body || req.query || {},
    });

    const confirmed = await confirmPaymentSuccess({
      paymentId,
      providerTxnId: approved.providerTxnId,
      approvedPayload: approved.approvedPayload,
    });

    if (String(confirmed?.resp || 'ERROR').toUpperCase() !== 'OK') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: confirmed?.resp_message || 'PAYMENT_CONFIRM_FAILED',
      });
    }

    return res.json({
      resp: 'OK',
      payment_id: Number(confirmed.payment_id || paymentId),
      login_id: confirmed.login_id || payment.login_id,
      current_tokens: Number(confirmed.current_tokens || 0),
      granted_tokens: Number(confirmed.granted_tokens || 0),
    });
  } catch (err) {
    console.error('[PAYMENT CONFIRM API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'PAYMENT_CONFIRM_FAILED',
      message: err.message,
    });
  }
};

exports.failPayment = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.body?.payment_id || req.query?.payment_id);
    if (!paymentId) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'PAYMENT_ID_REQUIRED',
      });
    }

    const row = await markPaymentFailed({
      paymentId,
      providerTxnId: req.body?.provider_txn_id || req.query?.provider_txn_id || '',
      errorMessage: req.body?.error_message || req.query?.error_message || 'PAYMENT_FAILED',
      failedPayload: req.body && Object.keys(req.body).length > 0 ? req.body : req.query || {},
    });

    const resp = String(row?.resp || 'ERROR').toUpperCase();
    if (resp !== 'OK') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: row?.resp_message || 'PAYMENT_FAIL_UPDATE_FAILED',
      });
    }

    return res.json({
      resp: 'OK',
      payment_id: Number(row.payment_id || paymentId),
    });
  } catch (err) {
    console.error('[PAYMENT FAIL API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'PAYMENT_FAIL_UPDATE_FAILED',
    });
  }
};

exports.cancelPayment = async (req, res) => {
  try {
    const paymentId = parsePaymentId(req.body?.payment_id || req.query?.payment_id);
    if (!paymentId) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'PAYMENT_ID_REQUIRED',
      });
    }

    const row = await markPaymentCanceled({
      paymentId,
      providerTxnId: req.body?.provider_txn_id || req.query?.provider_txn_id || '',
      memo: req.body?.memo || req.query?.memo || 'USER_CANCELED',
      canceledPayload: req.body && Object.keys(req.body).length > 0 ? req.body : req.query || {},
    });

    if (String(row?.resp || 'ERROR').toUpperCase() !== 'OK') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: row?.resp_message || 'PAYMENT_CANCEL_UPDATE_FAILED',
      });
    }

    return res.json({
      resp: 'OK',
      payment_id: Number(row.payment_id || paymentId),
    });
  } catch (err) {
    console.error('[PAYMENT CANCEL API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'PAYMENT_CANCEL_UPDATE_FAILED',
    });
  }
};

exports.grantEventToken = async (req, res) => {
  try {
    const loginId = getSessionLoginId(req);
    if (!loginId) {
      return res.status(401).json({
        resp: 'ERROR',
        resp_message: 'LOGIN_REQUIRED',
      });
    }

    const amount = Number(req.body?.amount || 0);
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: 'INVALID_GRANT_AMOUNT',
      });
    }

    const row = await grantEventToken({
      loginId,
      amount,
      eventCode: String(req.body?.event_code || 'MANUAL_EVENT').trim(),
      memo: String(req.body?.memo || '').trim(),
    });

    const resp = String(row?.resp || 'ERROR').toUpperCase();
    if (resp !== 'OK') {
      return res.status(400).json({
        resp: 'ERROR',
        resp_message: row?.resp_message || 'EVENT_TOKEN_GRANT_FAILED',
      });
    }

    return res.json({
      resp: 'OK',
      current_tokens: Number(row.current_tokens || 0),
      granted_tokens: Number(row.granted_tokens || amount),
    });
  } catch (err) {
    console.error('[TOKEN GRANT API ERROR]', err);
    return res.status(500).json({
      resp: 'ERROR',
      resp_message: 'EVENT_TOKEN_GRANT_FAILED',
    });
  }
};

exports.providerCallbackSuccess = async (req, res) => {
  try {
    const result = await exports.confirmPayment(req, {
      status(code) {
        this._status = code;
        return this;
      },
      json(payload) {
        this._payload = payload;
        return payload;
      },
    });

    if (result && result.resp === 'OK') {
      return res.redirect(`/user/billing/success?payment_id=${encodeURIComponent(String(result.payment_id || ''))}`);
    }

    return res.redirect('/user/billing/failed');
  } catch (err) {
    console.error('[PAYMENT CALLBACK SUCCESS ERROR]', err);
    return res.redirect('/user/billing/failed');
  }
};

exports.providerCallbackCancel = async (req, res) => {
  try {
    await exports.cancelPayment(req, {
      status(code) {
        this._status = code;
        return this;
      },
      json(payload) {
        this._payload = payload;
        return payload;
      },
    });
  } catch (err) {
    console.error('[PAYMENT CALLBACK CANCEL ERROR]', err);
  }

  return res.redirect('/user/billing/canceled');
};

exports.providerCallbackFail = async (req, res) => {
  try {
    await exports.failPayment(req, {
      status(code) {
        this._status = code;
        return this;
      },
      json(payload) {
        this._payload = payload;
        return payload;
      },
    });
  } catch (err) {
    console.error('[PAYMENT CALLBACK FAIL ERROR]', err);
  }

  return res.redirect('/user/billing/failed');
};
