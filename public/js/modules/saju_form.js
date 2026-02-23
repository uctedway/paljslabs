import GlobalLoading from './global_loading.js';

export function initSajuFormContainer({ sajuTargets = [] } = {}) {
	console.log('initSajuFormContainer called');
	const form = document.getElementById('sajuForm');
	if (!form) return;

	const isEn = String(document?.documentElement?.lang || '').toLowerCase().startsWith('en');
	const L = (ko, en) => (isEn ? en : ko);
	const relationDisplayMap = {
		SPOUSE: L('배우자', 'Spouse'),
		PARENT: L('부모', 'Parent'),
		GRANDPARENT: L('조부모', 'Grandparent'),
		SON: L('아들', 'Son'),
		DAUGHTER: L('딸', 'Daughter'),
		SIBLING: L('형제자매', 'Sibling'),
		FAMILY: L('가족', 'Family'),
		FRIEND: L('친구', 'Friend'),
		OTHER: L('기타', 'Other'),
	};

	function normalizeTargetLabel(label) {
		const raw = String(label || '').trim();
		if (!raw) return raw;
		const parts = raw.split('·');
		if (parts.length < 2) return raw;
		const relationCode = String(parts[0] || '').trim().toUpperCase();
		const name = String(parts.slice(1).join('·') || '').trim();
		const relationLabel = relationDisplayMap[relationCode] || parts[0].trim();
		return `${relationLabel} · ${name}`;
	}

	function normalizeBirthTimeValue(raw) {
		const v = String(raw || '').trim();
		if (!v) return '';
		if (v === '99:99:99') return v;
		if (v.includes('T')) {
			const t = v.split('T')[1] || '';
			if (t.length >= 8) return t.slice(0, 8);
		}
		if (v.includes('.')) return v.split('.')[0].slice(0, 8);
		if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
		if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
		return v.slice(0, 8);
	}

	function getCurrentLocale() {
		const docLang = String(document?.documentElement?.lang || '').trim().toLowerCase();
		const navLang = String((navigator.language || '')).trim().toLowerCase();
		const raw = docLang || navLang || 'ko';
		if (raw.startsWith('en')) return 'en';
		if (raw.startsWith('ja')) return 'ja';
		if (raw.startsWith('zh')) return 'zh';
		return 'ko';
	}

	function askTrialFallback(currentTokens, trialRequired = 3) {
		const current = Number(currentTokens || 0);
		if (!Number.isFinite(current) || current < trialRequired) {
			alert(L('토큰이 부족합니다. 토큰 충전 후 프리미엄 분석을 이용해주세요.', 'Insufficient tokens. Please top up and try premium analysis.'));
			window.location.href = '/user/billing';
			return false;
		}
		return window.confirm(
			isEn
				? `Premium analysis requires 10 tokens.\nYou have ${current} tokens. Proceed with trial analysis (${trialRequired} tokens)?`
				: `프리미엄 분석(10토큰)이 부족합니다.\n현재 ${current}토큰으로 체험 분석(${trialRequired}토큰)을 진행할까요?`
		);
	}

	sajuTargets = (sajuTargets || []).map((target) => ({
		...target,
		label: normalizeTargetLabel(target.label),
	}));
	
	const targetSelect = document.getElementById('sajuTarget');
	const relativeIdInput = document.getElementById('relativeId');
	const nameInput = document.getElementById('name');
	const yearSelect = document.getElementById('birthYear');
	const monthSelect = document.getElementById('birthMonth');
	const daySelect = document.getElementById('birthDay');
	const birthTimeSelect = document.getElementById('birthTime');
	
	const currentYear = new Date().getFullYear();
	
	// 년도 옵션 생성 (1920 ~ 현재)
	for (let year = currentYear; year >= 1920; year--) {
		const option = document.createElement('option');
		option.value = year;
		option.textContent = isEn ? String(year) : year + '년';
		yearSelect.appendChild(option);
	}
	
	// 월 옵션 생성
	for (let month = 1; month <= 12; month++) {
		const option = document.createElement('option');
		option.value = String(month).padStart(2, '0');
		option.textContent = isEn ? String(month) : month + '월';
		monthSelect.appendChild(option);
	}
	
	// 일 옵션 생성 함수
	function updateDays() {
		const year = parseInt(yearSelect.value) || currentYear;
		const month = parseInt(monthSelect.value) || 1;
		const daysInMonth = new Date(year, month, 0).getDate();
		
		const currentDay = daySelect.value;
		daySelect.innerHTML = `<option value="">${L('일', 'Day')}</option>`;
		
		for (let day = 1; day <= daysInMonth; day++) {
			const option = document.createElement('option');
			option.value = String(day).padStart(2, '0');
			option.textContent = isEn ? String(day) : day + '일';
			daySelect.appendChild(option);
		}
		
		if (currentDay && parseInt(currentDay) <= daysInMonth) {
			daySelect.value = currentDay;
		}
	}
	
	yearSelect.addEventListener('change', updateDays);
	monthSelect.addEventListener('change', updateDays);
	updateDays();

	// 본인/지인 선택 시 저장된 생년월일시를 자동으로 채웁니다.
	// 필수 정보가 비어 있으면 경고 후 직접입력 상태로 유지합니다.
	if (targetSelect) {
		targetSelect.addEventListener('change', () => {
			const selectedId = String(targetSelect.value || '');
			if (!selectedId) {
				if (relativeIdInput) relativeIdInput.value = '0';
				return;
			}

			const target = sajuTargets.find((item) => String(item.id) === selectedId);
			if (!target) return;

			const normalizedBirthTime = normalizeBirthTimeValue(target.birthTime) || '99:99:99';
			if (!target.birthDate) {
				alert(L('선택한 대상의 생년월일시 정보가 없습니다. 마이페이지에서 먼저 입력해주세요.', 'Selected target has no birth data. Please update it in My Page first.'));
				targetSelect.value = '';
				if (relativeIdInput) relativeIdInput.value = '0';
				return;
			}

			const [year, month, day] = String(target.birthDate).split('-');
			if (!year || !month || !day) {
				alert(L('선택한 대상의 생년월일 형식이 올바르지 않습니다.', 'Selected target birth date format is invalid.'));
				targetSelect.value = '';
				if (relativeIdInput) relativeIdInput.value = '0';
				return;
			}

			yearSelect.value = year;
			monthSelect.value = month;
			updateDays();
			daySelect.value = day;

			if (nameInput && target.name) {
				nameInput.value = target.name;
			}

			if (birthTimeSelect) {
				birthTimeSelect.value = normalizedBirthTime;
			}

			const gender = String(target.gender || '').toLowerCase();
			const genderRadio = form.querySelector(`input[name="gender"][value="${gender}"]`);
			if (genderRadio) {
				genderRadio.checked = true;
			}

			// 지인 선택일 때만 relative_id를 넘기고, 본인 선택/직접입력은 0으로 유지합니다.
			if (relativeIdInput) {
				relativeIdInput.value = target.type === 'relative' ? String(target.id) : '0';
			}
		});
	}
	
	// 폼 제출 처리
	form.addEventListener('submit', async function(e) {
		e.preventDefault();

		if (!validateForm()) return;

		const preSavePayload = collectPreSavePayload();
		const shouldAskSave = shouldAskTargetSave(preSavePayload);
		if (shouldAskSave) {
			const saveDecision = await askTargetSaveDecision();
			if (saveDecision) {
				fireAndForgetTargetSave({ ...preSavePayload, ...saveDecision });
			}
		}

		GlobalLoading.show(L('요청을 접수하고 있습니다.', 'Request received.'), L('사주 분석을 시작합니다.', 'Starting Saju analysis.'));

		try {
			const formData = new FormData(form);
			const payload = Object.fromEntries(formData.entries());
			payload.locale = getCurrentLocale();
			payload.analysis_mode = 'PREMIUM';

			let response = await fetch('/api/saju/request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload),
				credentials: 'same-origin'
			});
			let json = await response.json();

			if (!response.ok || json.resp !== 'OK') {
				if (response.status === 402) {
					const wantsTrial = askTrialFallback(json.current_tokens, 3);
					if (wantsTrial) {
						payload.analysis_mode = 'TRIAL';
						response = await fetch('/api/saju/request', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(payload),
							credentials: 'same-origin'
						});
						json = await response.json();
					} else {
						GlobalLoading.hide();
						if (Number(json.current_tokens || 0) >= 3) {
							window.location.href = '/user/billing';
						}
						return;
					}
				}
			}

			if (!response.ok || json.resp !== 'OK') {
				GlobalLoading.hide();
				alert(json.message || json.resp_message || L('요청 처리 중 오류가 발생했습니다.', 'An error occurred while processing your request.'));
				return;
			}

			if (typeof json.current_tokens === 'number') {
				const headerTokenEl = document.getElementById('headerTokenBalance');
				if (headerTokenEl) {
					headerTokenEl.textContent = Number(json.current_tokens || 0).toLocaleString(isEn ? 'en-US' : 'ko-KR');
				}
			}
			GlobalLoading.setMessage(
				L('분석을 시작합니다.', 'Analysis started.'),
				L('분석이 완료되면 알려드리겠습니다.', 'We will notify you when it is complete.')
			);
			window.dispatchEvent(new CustomEvent('analysis:started', {
				detail: {
					resultId: String(json.result_id || ''),
					serviceType: 'saju',
				},
			}));
			await wait(900);
			GlobalLoading.hide();
		} catch (err) {
			console.error('[SAJU REQUEST ERROR]', err);
			GlobalLoading.hide();
			alert(L('요청 처리 중 오류가 발생했습니다.', 'An error occurred while processing your request.'));
		}
	});

	function collectPreSavePayload() {
		return {
			name: (nameInput?.value || '').trim(),
			birthYear: yearSelect?.value || '',
			birthMonth: monthSelect?.value || '',
			birthDay: daySelect?.value || '',
			birthTime: birthTimeSelect?.value || '',
			gender: (form.querySelector('input[name="gender"]:checked') || {}).value || '',
			sajuTarget: targetSelect ? String(targetSelect.value || '') : '',
			relative_id: relativeIdInput ? String(relativeIdInput.value || '0') : '0',
		};
	}

	function shouldAskTargetSave(payload) {
		const selectedTarget = String(payload?.sajuTarget || '').trim();
		const relativeId = Number(payload?.relative_id || 0);
		// 직접 입력(새로 보기)일 때만 저장 제안을 띄웁니다.
		return !selectedTarget && relativeId <= 0;
	}

	function fireAndForgetTargetSave(payload) {
		fetch('/api/saju/target/save', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'same-origin',
			body: JSON.stringify(payload || {}),
		})
			.then(async (res) => {
				let json = null;
				try {
					json = await res.json();
				} catch (_) {}
				if (!res.ok || !json || json.resp !== 'OK') {
					console.warn('[TARGET SAVE] failed:', json?.resp_message || res.status);
				}
			})
			.catch((err) => {
				console.warn('[TARGET SAVE] network error:', err.message);
			});
	}

	function askTargetSaveDecision() {
		return new Promise((resolve) => {
			const overlay = document.createElement('div');
			overlay.style.position = 'fixed';
			overlay.style.inset = '0';
			overlay.style.background = 'rgba(0,0,0,0.45)';
			overlay.style.display = 'flex';
			overlay.style.alignItems = 'center';
			overlay.style.justifyContent = 'center';
			overlay.style.zIndex = '3000';

			const box = document.createElement('div');
			box.style.width = 'min(420px, calc(100% - 32px))';
			box.style.background = '#fff';
			box.style.borderRadius = '12px';
			box.style.padding = '18px';
			box.style.boxShadow = '0 18px 50px rgba(0, 0, 0, 0.2)';
			box.innerHTML = `
				<h3 style="margin:0 0 8px;font-size:18px;">${L('입력 정보 저장', 'Save Input Data')}</h3>
				<p style="margin:0 0 12px;color:#475569;line-height:1.5;">${L('이 정보를 다음 상담을 위해 내정보 또는 지인정보에 추가하시겠습니까?', 'Save this data to profile or contact for next consultation?')}</p>
				<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
					<button type="button" id="saveToProfileBtn" style="padding:8px 12px;">${L('내정보에 저장', 'Save to Profile')}</button>
					<button type="button" id="saveToRelativeBtn" style="padding:8px 12px;">${L('지인으로 저장', 'Save as Contact')}</button>
					<button type="button" id="skipSaveBtn" style="padding:8px 12px;">${L('건너뛰기', 'Skip')}</button>
				</div>
				<div id="relativeSelectWrap" style="display:none;margin-top:8px;">
					<label for="relationSelect" style="display:block;margin-bottom:6px;">${L('관계 선택', 'Select Relation')}</label>
					<select id="relationSelect" style="width:100%;padding:8px;">
						<option value="FRIEND">${L('친구', 'Friend')}</option>
						<option value="SPOUSE">${L('배우자', 'Spouse')}</option>
						<option value="PARENT">${L('부모', 'Parent')}</option>
						<option value="SON">${L('아들', 'Son')}</option>
						<option value="DAUGHTER">${L('딸', 'Daughter')}</option>
						<option value="SIBLING">${L('형제자매', 'Sibling')}</option>
						<option value="FAMILY">${L('가족', 'Family')}</option>
						<option value="GRANDPARENT">${L('조부모', 'Grandparent')}</option>
						<option value="OTHER">${L('기타', 'Other')}</option>
					</select>
					<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
						<button type="button" id="confirmRelativeSaveBtn" style="padding:8px 12px;">${L('확정', 'Confirm')}</button>
					</div>
				</div>
			`;

			overlay.appendChild(box);
			document.body.appendChild(overlay);

			function close(result) {
				overlay.remove();
				resolve(result || null);
			}

			const saveToProfileBtn = box.querySelector('#saveToProfileBtn');
			const saveToRelativeBtn = box.querySelector('#saveToRelativeBtn');
			const skipSaveBtn = box.querySelector('#skipSaveBtn');
			const relativeSelectWrap = box.querySelector('#relativeSelectWrap');
			const relationSelect = box.querySelector('#relationSelect');
			const confirmRelativeSaveBtn = box.querySelector('#confirmRelativeSaveBtn');

			saveToProfileBtn?.addEventListener('click', () => close({ save_as: 'profile' }));
			skipSaveBtn?.addEventListener('click', () => close(null));
			saveToRelativeBtn?.addEventListener('click', () => {
				if (relativeSelectWrap) relativeSelectWrap.style.display = 'block';
			});
			confirmRelativeSaveBtn?.addEventListener('click', () => {
				close({ save_as: 'relative', relation: relationSelect?.value || 'FRIEND' });
			});
			overlay.addEventListener('click', (event) => {
				if (event.target === overlay) close(null);
			});
		});
	}

	function wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	
	function validateForm() {
		const errors = [];
		
		if (!document.getElementById('name').value.trim()) errors.push(L('이름을 입력해주세요.', 'Please enter your name.'));
		if (!document.getElementById('counselingType').value) errors.push(L('상담유형을 선택해주세요.', 'Please select counseling tone.'));
		if (!yearSelect.value) errors.push(L('년도를 선택해주세요.', 'Please select year.'));
		if (!monthSelect.value) errors.push(L('월을 선택해주세요.', 'Please select month.'));
		if (!daySelect.value) errors.push(L('일을 선택해주세요.', 'Please select day.'));
		if (!document.getElementById('birthTime').value) errors.push(L('태어난 시간을 선택해주세요.', 'Please select birth time.'));
		if (!document.querySelector('input[name="gender"]:checked')) errors.push(L('성별을 선택해주세요.', 'Please select gender.'));
		
		if (errors.length > 0) {
			alert(errors.join('\n'));
			return false;
		}
		
		return true;
	}
}
