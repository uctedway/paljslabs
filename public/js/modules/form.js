// form.js

/**
 * 폼 초기화
 * - data-action 있는 form들에 submit 이벤트 바인딩
 * - mustInput 필수 검증 (값/체크/선택)
 * - data-confirm 있으면 confirm
 * - data-action으로 fetch 전송
 * - JSON 응답을 parseFormResurtJson로 전달
 */
export function initFormContainer(root = document) {
	console.log('initFormContainer');
  const forms = root.querySelectorAll('form[data-action]');

  forms.forEach((form) => {
	// 중복 바인딩 방지
	if (form.dataset.formInited === '1') return;
	form.dataset.formInited = '1';

	form.addEventListener('submit', async (e) => {
	  e.preventDefault();

	  // 1) 필수검증
	  const invalid = findFirstInvalidMustInput(form);
	  if (invalid) {
		const msg = invalid.el.getAttribute('data-alert') || '필수 입력 항목을 확인해주세요.';
		alert(msg);
		focusElement(invalid.el);
		return;
	  }

	  // 2) confirm
	  const confirmMsg = form.getAttribute('data-confirm');
	  if (confirmMsg) {
		const ok = confirm(confirmMsg);
		if (!ok) return;
	  }

	  // 3) fetch
	  const actionUrl = form.getAttribute('data-action');
	  if (!actionUrl) return;

	  const method = (form.getAttribute('method') || 'POST').toUpperCase();

	  try {
		const hasFileInput = !!form.querySelector('input[type="file"]');
		let fetchOptions = { method, credentials: 'same-origin' };
		if (hasFileInput) {
		  const fd = new FormData(form);
		  fetchOptions.body = fd;
		} else {
		  const params = new URLSearchParams(new FormData(form));
		  fetchOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
		  fetchOptions.body = params.toString();
		}

		const res = await fetch(actionUrl, fetchOptions);

		// 서버가 항상 JSON 준다고 하셨으니 그대로 파싱
		const json = await res.json();

		// 4) 결과 파싱/액션 수행
		parseFormResurtJson(json);
	  } catch (err) {
		alert('요청 처리 중 오류가 발생했습니다.');
		// 필요하면 콘솔 확인용
		console.error(err);
	  }
	});
  });
}

/**
 * 서버 응답 JSON 파싱
 * {
 *   resp: "OK" | "ERROR",
 *   resp_message: "...",
 *   resp_action: [{ type:"alert|redirect|reload", value:"..." }, ...]
 * }
 *
 * - resp_action이 없거나 비어있으면 아무것도 안 함
 * - 타입별로 순차 실행: alert, redirect, reload
 */
export function parseFormResurtJson(json) {
  if (!json || typeof json !== 'object') return;

  const actions = Array.isArray(json.resp_action) ? json.resp_action : [];
  if (actions.length === 0) return;

  for (const act of actions) {
	if (!act || typeof act !== 'object') continue;

	const type = (act.type || '').toLowerCase();
	const value = act.value;

	if (type === 'alert') {
	  alert(value ?? '');
	  continue;
	}

	if (type === 'redirect') {
	  if (typeof value === 'string' && value.trim() !== '') {
		window.location.href = value;
		return; // 이동하면 이후 액션 의미 없음
	  }
	  continue;
	}

	if (type === 'reload') {
	  window.location.reload();
	  return;
	}

	// 그 외 타입은 무시
  }
}

// 기존 오타 함수명을 사용하는 코드와의 호환을 위해 정상 철자 함수를 함께 제공합니다.
export function parseFormResultJson(json) {
  return parseFormResurtJson(json);
}

/* ----------------- 내부 헬퍼(비공개) ----------------- */

function findFirstInvalidMustInput(form) {
  const mustEls = form.querySelectorAll('.mustInput');

  for (const el of mustEls) {
	// disabled는 검사 제외
	if (el.disabled) continue;

	const tag = (el.tagName || '').toLowerCase();
	const type = ((el.getAttribute('type') || '')).toLowerCase();

	// checkbox
	if (type === 'checkbox') {
	  if (!el.checked) return { el };
	  continue;
	}

	// radio: 같은 name 그룹 중 하나라도 체크되어야 함
	if (type === 'radio') {
	  const name = el.getAttribute('name');
	  if (!name) {
		if (!el.checked) return { el };
		continue;
	  }
	  const checked = form.querySelector(`input[type="radio"][name="${cssEscape(name)}"]:checked`);
	  if (!checked) return { el };
	  continue;
	}

	// select
	if (tag === 'select') {
	  const v = (el.value ?? '').toString().trim();
	  if (!v) return { el };
	  continue;
	}

	// file
	if (type === 'file') {
	  if (!el.files || el.files.length === 0) return { el };
	  continue;
	}

	// text/textarea/기타 input
	const v = (el.value ?? '').toString().trim();
	if (!v) return { el };
  }

  return null;
}

function focusElement(el) {
  // radio/checkbox는 포커스가 애매할 수 있으니 일단 focus 시도
  try {
	el.focus({ preventScroll: false });
  } catch {
	try { el.focus(); } catch {}
  }

  // 스크롤도 같이 맞춰주면 UX 좋음(원치 않으시면 삭제)
  try {
	el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {}
}

// CSS selector용 escape (구형 브라우저 fallback)
function cssEscape(str) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(str);
  return String(str).replace(/["\\]/g, '\\$&');
}
