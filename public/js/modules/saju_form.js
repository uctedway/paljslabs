export function initSajuFormContainer() {
	console.log('initSajuFormContainer called');
	const form = document.getElementById('sajuForm');
	if (!form) return;
	
	const yearSelect = document.getElementById('birthYear');
	const monthSelect = document.getElementById('birthMonth');
	const daySelect = document.getElementById('birthDay');
	
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
	
	// 폼 제출 처리
	form.addEventListener('submit', async function(e) {
		e.preventDefault();
		
		if (!validateForm()) {
			return;
		}
		
		const formData = {
			birthYear: yearSelect.value,
			birthMonth: monthSelect.value,
			birthDay: daySelect.value,
			birthTime: document.getElementById('birthTime').value,
			gender: document.querySelector('input[name="gender"]:checked').value
		};
		
		try {
			const response = await fetch('/api/saju/fortune', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(formData)
			});
			
			const result = await response.json();
			console.log('응답:', result);
			
		} catch (error) {
			console.error('요청 실패:', error);
			alert('요청 중 오류가 발생했습니다.');
		}
	});
	
	function validateForm() {
		const errors = [];
		
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