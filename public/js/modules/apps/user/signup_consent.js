function showToast(message) {
  const text = String(message || '').trim();
  if (!text) return;
  if (window.AppToast && typeof window.AppToast.show === 'function') {
    window.AppToast.show(text, { type: 'warning', duration: 2400 });
    return;
  }
  window.alert(text);
}

function isChecked(selector) {
  const el = document.querySelector(selector);
  return !!(el && el.checked);
}

function canProceed() {
  return isChecked('#agree-terms') && isChecked('#agree-privacy');
}

function applyProviderLockState(locked) {
  const targets = document.querySelectorAll('.provider-row, .google-signin-wrap');
  targets.forEach((el) => {
    el.classList.toggle('is-locked', !!locked);
    if (el.classList.contains('provider-row')) {
      el.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
  });
}

async function syncConsentToSession() {
  const params = new URLSearchParams();
  params.set('terms_agreed', isChecked('#agree-terms') ? '1' : '0');
  params.set('privacy_agreed', isChecked('#agree-privacy') ? '1' : '0');
  try {
    const res = await fetch('/user/auth/signup-consent', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: params.toString(),
    });
    const json = await res.json();
    return String(json?.resp || '').toUpperCase() === 'OK';
  } catch (e) {
    return false;
  }
}

function bindSocialProviderLinks() {
  const links = document.querySelectorAll('.provider-row');
  links.forEach((link) => {
    link.addEventListener('click', async (e) => {
      if (!canProceed()) {
        e.preventDefault();
        showToast('이용약관과 개인정보처리방침에 동의해주세요.');
        return;
      }
      e.preventDefault();
      const ok = await syncConsentToSession();
      if (!ok) {
        showToast('동의 상태 저장에 실패했습니다. 다시 시도해주세요.');
        return;
      }
      window.location.href = link.getAttribute('href') || '#';
    });
  });
}

function bindConsentCheckboxes() {
  const boxes = document.querySelectorAll('#agree-terms, #agree-privacy');
  const refresh = () => applyProviderLockState(!canProceed());
  boxes.forEach((box) => box.addEventListener('change', refresh));
  refresh();
}

export function initSignupConsentGate() {
  if (window.socialAuthIntent !== 'register') return;
  window.isSignupConsentAccepted = canProceed;
  window.syncSignupConsentToSession = syncConsentToSession;
  bindSocialProviderLinks();
  bindConsentCheckboxes();
}
