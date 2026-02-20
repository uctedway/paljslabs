import { parseFormResultJson } from '../../form.js';
// /js/google_auth.js

/**
 * 구글 토큰을 서버로 전송
 */
export async function googleSendTokenToServer(credential) {
  const intent = String(window.socialAuthIntent || 'login').toLowerCase() === 'register' ? 'register' : 'login';
	console.log('googleSendTokenToServer');
  const response = await fetch('/user/auth/google', {
	method: 'POST',
	headers: {
	  'Content-Type': 'application/json',
	},
	body: JSON.stringify({ token: credential, intent }),
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
	console.log('[GOOGLE LOGIN] credential received:', !!response?.credential);

	const result = await googleSendTokenToServer(response.credential);
    //결과처리
    console.log('결과처리 시작');
	parseFormResultJson(result);
  console.log('결과처리 끝');
  
  } catch (e) {
	console.error('[GOOGLE LOGIN ERROR]', e);
  }
}
