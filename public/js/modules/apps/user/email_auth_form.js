import { parseFormResultJson } from '../../form.js';

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
  REQUIRED_VALUES_MISSING: '필수 입력 항목을 확인해주세요.',
  INVALID_EMAIL_FORMAT: '올바른 이메일 형식이 아닙니다.',
  WEAK_PASSWORD: '비밀번호는 8자 이상이어야 합니다.',
  PASSWORD_MISMATCH: '비밀번호와 비밀번호 확인이 일치하지 않습니다.',
  CONSENT_REQUIRED: '이용약관과 개인정보처리방침에 동의해주세요.',
  USER_ALREADY_EXISTS: '이미 가입된 이메일입니다.',
  USER_NOT_FOUND: '가입된 이메일 계정을 찾을 수 없습니다.',
  INVALID_PASSWORD: '비밀번호가 올바르지 않습니다.',
  EMAIL_SIGNUP_FAILED: '이메일 회원가입 처리 중 오류가 발생했습니다.',
  EMAIL_LOGIN_FAILED: '이메일 로그인 처리 중 오류가 발생했습니다.',
};

function resolveCodeMessage(code) {
  const key = String(code || '').trim().toUpperCase();
  return CODE_MESSAGES[key] || '요청 처리 중 오류가 발생했습니다.';
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
        showToast(rule.message || '필수 입력 항목을 확인해주세요.');
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
      showToast('요청 처리 중 오류가 발생했습니다.');
    }
  });
}
