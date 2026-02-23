import { parseFormResultJson } from '../../form.js';

function isEn() {
  return String(document?.documentElement?.lang || '').toLowerCase().startsWith('en');
}

function showToast(message) {
  const text = String(message || '').trim();
  if (!text) return;
  if (window.AppToast && typeof window.AppToast.show === 'function') {
    window.AppToast.show(text, { type: 'warning', duration: 2400 });
    return;
  }
  window.alert(text);
}

function isEmptyValue(value) {
  return String(value || '').trim() === '';
}

function isMissingFieldValue(input) {
  if (!input) return true;
  const type = String(input.getAttribute('type') || '').toLowerCase();
  if (type === 'checkbox' || type === 'radio') {
    return !input.checked;
  }
  return isEmptyValue(input.value);
}

const CODE_MESSAGES = {
  ko: {
    REQUIRED_VALUES_MISSING: '필수 입력 항목을 확인해주세요.',
    INVALID_EMAIL_FORMAT: '올바른 이메일 형식이 아닙니다.',
    WEAK_PASSWORD: '비밀번호는 8자 이상이어야 합니다.',
    PASSWORD_MISMATCH: '비밀번호와 비밀번호 확인이 일치하지 않습니다.',
    CONSENT_REQUIRED: '이용약관과 개인정보처리방침에 동의해주세요.',
    USER_ALREADY_EXISTS: '이미 가입된 이메일입니다.',
    USER_NOT_FOUND: '가입된 이메일 계정을 찾을 수 없습니다.',
    USER_WITHDRAWN: '탈퇴 처리된 계정입니다. 이메일 계정은 재가입 후 이용해주세요.',
    INVALID_PASSWORD: '비밀번호가 올바르지 않습니다.',
    EMAIL_SIGNUP_FAILED: '이메일 회원가입 처리 중 오류가 발생했습니다.',
    EMAIL_LOGIN_FAILED: '이메일 로그인 처리 중 오류가 발생했습니다.',
    UNKNOWN: '요청 처리 중 오류가 발생했습니다.',
  },
  en: {
    REQUIRED_VALUES_MISSING: 'Please check required fields.',
    INVALID_EMAIL_FORMAT: 'Invalid email format.',
    WEAK_PASSWORD: 'Password must be at least 8 characters.',
    PASSWORD_MISMATCH: 'Password and confirmation do not match.',
    CONSENT_REQUIRED: 'Please agree to Terms and Privacy Policy.',
    USER_ALREADY_EXISTS: 'This email is already registered.',
    USER_NOT_FOUND: 'No account found for this email.',
    USER_WITHDRAWN: 'This account was withdrawn. Please sign up again.',
    INVALID_PASSWORD: 'Incorrect password.',
    EMAIL_SIGNUP_FAILED: 'Email signup failed.',
    EMAIL_LOGIN_FAILED: 'Email login failed.',
    UNKNOWN: 'An error occurred while processing your request.',
  },
};

function resolveCodeMessage(code) {
  const key = String(code || '').trim().toUpperCase();
  const lang = isEn() ? 'en' : 'ko';
  return CODE_MESSAGES[lang][key] || CODE_MESSAGES[lang].UNKNOWN;
}

async function postFormAsFetch(form) {
  const actionUrl = form.getAttribute('action') || window.location.pathname;
  const method = (form.getAttribute('method') || 'POST').toUpperCase();
  const params = new URLSearchParams(new FormData(form));
  const response = await fetch(actionUrl, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: params.toString(),
  });
  let json = {};
  try {
    json = await response.json();
  } catch (e) {
    json = { resp: 'ERROR', resp_message: 'INVALID_RESPONSE', resp_action: [] };
  }
  return json;
}

export function bindEmailAuthForm(formSelector, fields) {
  const form = document.querySelector(formSelector);
  if (!form || form.dataset.emailAuthBound === '1') return;
  form.dataset.emailAuthBound = '1';

  const rules = Array.isArray(fields) ? fields : [];
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    for (const rule of rules) {
      const input = form.querySelector(rule.selector);
      if (!input) continue;
      if (isMissingFieldValue(input)) {
        showToast(rule.message || (isEn() ? 'Please check required fields.' : '필수 입력 항목을 확인해주세요.'));
        input.focus();
        return;
      }
    }

    try {
      const result = await postFormAsFetch(form);
      const resp = String(result?.resp || 'ERROR').toUpperCase();
      const code = String(result?.resp_message || '').toUpperCase();
      if (resp !== 'OK') {
        showToast(resolveCodeMessage(code));
        return;
      }
      parseFormResultJson(result);
    } catch (err) {
      console.error('[EMAIL AUTH FETCH ERROR]', err);
      showToast(isEn() ? 'An error occurred while processing your request.' : '요청 처리 중 오류가 발생했습니다.');
    }
  });
}
