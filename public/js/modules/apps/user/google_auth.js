import { parseFormResultJson } from '../../form.js';
// /js/google_auth.js

/**
 * 구글 토큰을 서버로 전송
 */
export async function googleSendTokenToServer(credential) {
  const intent = String(window.socialAuthIntent || 'login').toLowerCase() === 'register' ? 'register' : 'login';
  const termsAgreed = intent === 'register' && typeof document !== 'undefined'
    ? !!document.querySelector('#agree-terms:checked')
    : false;
  const privacyAgreed = intent === 'register' && typeof document !== 'undefined'
    ? !!document.querySelector('#agree-privacy:checked')
    : false;
	console.log('googleSendTokenToServer');
  const response = await fetch('/user/auth/google', {
	method: 'POST',
	headers: {
	  'Content-Type': 'application/json',
	},
	body: JSON.stringify({
      token: credential,
      intent,
      terms_agreed: termsAgreed ? '1' : '0',
      privacy_agreed: privacyAgreed ? '1' : '0',
    }),
  });
console.log(JSON.stringify(response));
  return await response.json();
}

/**
 실제 구글버튼클릭시 호출되는 함수입니다.
 Google Identity Services 콜백
 */
export async function googleHandleCredentialResponse(response) {
  console.log('googleHandleCredentialResponse called');
  try {
    if (String(window.socialAuthIntent || '').toLowerCase() === 'register') {
      const canProceed = typeof window.isSignupConsentAccepted === 'function'
        ? !!window.isSignupConsentAccepted()
        : false;
      if (!canProceed) {
        if (window.AppToast && typeof window.AppToast.show === 'function') {
          window.AppToast.show('이용약관과 개인정보처리방침에 동의해주세요.', { type: 'warning', duration: 2400 });
        } else {
          alert('이용약관과 개인정보처리방침에 동의해주세요.');
        }
        return;
      }
      if (typeof window.syncSignupConsentToSession === 'function') {
        const synced = await window.syncSignupConsentToSession();
        if (!synced) {
          if (window.AppToast && typeof window.AppToast.show === 'function') {
            window.AppToast.show('동의 상태 저장에 실패했습니다. 다시 시도해주세요.', { type: 'warning', duration: 2400 });
          } else {
            alert('동의 상태 저장에 실패했습니다. 다시 시도해주세요.');
          }
          return;
        }
      }
    }
	console.log('[GOOGLE LOGIN] credential received:', !!response?.credential);

	const result = await googleSendTokenToServer(response.credential);
    const resp = String(result?.resp || '').toUpperCase();
    const code = String(result?.resp_message || '').toUpperCase();
    if (resp !== 'OK' && code === 'CONSENT_REQUIRED') {
      if (window.AppToast && typeof window.AppToast.show === 'function') {
        window.AppToast.show('이용약관과 개인정보처리방침에 동의해주세요.', { type: 'warning', duration: 2400 });
      } else {
        alert('이용약관과 개인정보처리방침에 동의해주세요.');
      }
      return;
    }
    //결과처리
    console.log('결과처리 시작');
	parseFormResultJson(result);
  console.log('결과처리 끝');
  
  } catch (e) {
	console.error('[GOOGLE LOGIN ERROR]', e);
  }
}
