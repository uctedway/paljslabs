import GlobalLoading from './global_loading.js';

export function initSajuFormContainer({ sajuTargets = [] } = {}) {
	console.log('initSajuFormContainer called');
	const form = document.getElementById('sajuForm');
	if (!form) return;

	const relationDisplayMap = {
		SPOUSE: '배우자',
		PARENT: '부모',
		GRANDPARENT: '조부모',
		SON: '아들',
		DAUGHTER: '딸',
		SIBLING: '형제자매',
		FAMILY: '가족',
		FRIEND: '친구',
		OTHER: '기타',
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
		option.textContent = year + '년';
		yearSelect.appendChild(option);
	}
	
	// 월 옵션 생성
	for (let month = 1; month <= 12; month++) {
		const option = document.createElement('option');
		option.value = String(month).padStart(2, '0');
		option.textContent = month + '월';
		monthSelect.appendChild(option);
	}
	
	// 일 옵션 생성 함수
	function updateDays() {
		const year = parseInt(yearSelect.value) || currentYear;
		const month = parseInt(monthSelect.value) || 1;
		const daysInMonth = new Date(year, month, 0).getDate();
		
		const currentDay = daySelect.value;
		daySelect.innerHTML = '<option value="">일</option>';
		
		for (let day = 1; day <= daysInMonth; day++) {
			const option = document.createElement('option');
			option.value = String(day).padStart(2, '0');
			option.textContent = day + '일';
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
				alert('선택한 대상의 생년월일시 정보가 없습니다. 마이페이지에서 먼저 입력해주세요.');
				targetSelect.value = '';
				if (relativeIdInput) relativeIdInput.value = '0';
				return;
			}

			const [year, month, day] = String(target.birthDate).split('-');
			if (!year || !month || !day) {
				alert('선택한 대상의 생년월일 형식이 올바르지 않습니다.');
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

		GlobalLoading.show('요청을 접수하고 있습니다.', '사주 분석을 시작합니다.');

		try {
			const formData = new FormData(form);
			const payload = Object.fromEntries(formData.entries());

			const response = await fetch('/api/saju/request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload),
				credentials: 'same-origin'
			});
			const json = await response.json();

			if (!response.ok || json.resp !== 'OK') {
				GlobalLoading.hide();
				alert(json.message || json.resp_message || '요청 처리 중 오류가 발생했습니다.');
				return;
			}

			if (typeof json.current_tokens === 'number') {
				const headerTokenEl = document.getElementById('headerTokenBalance');
				if (headerTokenEl) {
					headerTokenEl.textContent = Number(json.current_tokens || 0).toLocaleString('ko-KR');
				}
			}
			GlobalLoading.setMessage(
				'분석을 시작합니다.',
				'분석이 완료되면 알려드리겠습니다.'
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
			alert('요청 처리 중 오류가 발생했습니다.');
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
				<h3 style="margin:0 0 8px;font-size:18px;">입력 정보 저장</h3>
				<p style="margin:0 0 12px;color:#475569;line-height:1.5;">이 정보를 다음 상담을 위해 내정보 또는 지인정보에 추가하시겠습니까?</p>
				<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
					<button type="button" id="saveToProfileBtn" style="padding:8px 12px;">내정보에 저장</button>
					<button type="button" id="saveToRelativeBtn" style="padding:8px 12px;">지인으로 저장</button>
					<button type="button" id="skipSaveBtn" style="padding:8px 12px;">건너뛰기</button>
				</div>
				<div id="relativeSelectWrap" style="display:none;margin-top:8px;">
					<label for="relationSelect" style="display:block;margin-bottom:6px;">관계 선택</label>
					<select id="relationSelect" style="width:100%;padding:8px;">
						<option value="FRIEND">친구</option>
						<option value="SPOUSE">배우자</option>
						<option value="PARENT">부모</option>
						<option value="SON">아들</option>
						<option value="DAUGHTER">딸</option>
						<option value="SIBLING">형제자매</option>
						<option value="FAMILY">가족</option>
						<option value="GRANDPARENT">조부모</option>
						<option value="OTHER">기타</option>
					</select>
					<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
						<button type="button" id="confirmRelativeSaveBtn" style="padding:8px 12px;">확정</button>
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
		
		if (!document.getElementById('name').value.trim()) errors.push('이름을 입력해주세요.');
		if (!document.getElementById('counselingType').value) errors.push('상담유형을 선택해주세요.');
		if (!yearSelect.value) errors.push('년도를 선택해주세요.');
		if (!monthSelect.value) errors.push('월을 선택해주세요.');
		if (!daySelect.value) errors.push('일을 선택해주세요.');
		if (!document.getElementById('birthTime').value) errors.push('태어난 시간을 선택해주세요.');
		if (!document.querySelector('input[name="gender"]:checked')) errors.push('성별을 선택해주세요.');
		
		if (errors.length > 0) {
			alert(errors.join('\n'));
			return false;
		}
		
		return true;
	}
}
