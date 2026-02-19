const path = require('path');
const db = require('../core/utils/db');
const { getRequestLocale, getRelationLabel } = require('../core/utils/relation_codes');
const {
	getSajuResultRecord,
	getSajuResultRecordByShareToken,
} = require('../api/services/saju_result_store');

function normalizeGenderForForm(rawGender) {
	const v = String(rawGender || '').trim().toLowerCase();
	if (v === 'm' || v === 'male' || v === '남' || v === '남성') return 'male';
	if (v === 'f' || v === 'female' || v === '여' || v === '여성') return 'female';
	return '';
}

function normalizeDateForInput(rawDate) {
	if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
		return rawDate.toISOString().slice(0, 10);
	}

	const v = String(rawDate || '').trim();
	if (!v) return '';
	// Date/Datetime 문자열이 들어와도 date input 형식(YYYY-MM-DD)으로 맞춥니다.
	if (v.includes('T')) return v.split('T')[0];
	if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
	return '';
}

function normalizeTimeForInput(rawTime, birthTimeUnknown = 0) {
	if (Number(birthTimeUnknown || 0) === 1) return '99:99:99';
	if (rawTime instanceof Date && !Number.isNaN(rawTime.getTime())) {
		return rawTime.toISOString().slice(11, 19);
	}
	const v = String(rawTime || '').trim();
	if (!v) return '';

	// MSSQL TIME 직렬화가 DateTime 형태로 들어오는 경우도 대응
	if (v.includes('T')) {
		const t = v.split('T')[1] || '';
		if (t.length >= 8) return t.slice(0, 8);
	}

	// HH:mm:ss.SSS -> HH:mm:ss
	if (v.includes('.')) return v.split('.')[0].slice(0, 8);

	// HH:mm -> HH:mm:ss
	if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;

	// HH:mm:ss 그대로
	if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;

	return v.slice(0, 8);
}

/**
 * 사주 입력 인덱스 페이지
 */
const index = async (req, res) => {
	const sessionUser = req.session && req.session.user ? req.session.user : null;
	const profile = req.session && req.session.mypageProfile ? req.session.mypageProfile : {};
	const locale = getRequestLocale(req);
	let relatives = [];

	// 지인 목록은 DB 프로시저(PJ_USP_SELECT_RELATIVES)로 조회합니다.
	if (sessionUser && sessionUser.login_id) {
		try {
			const qLoginId = db.convertQ(sessionUser.login_id);
			const query = `
				EXEC dbo.PJ_USP_SELECT_RELATIVES
				  @login_id = '${qLoginId}'
			`;
			const rs = await db.query(query);

			// 프로시저 에러 응답 행(resp/error)일 수 있으므로 실제 지인 행만 필터링합니다.
			relatives = (rs || []).filter((row) => Number(row.relative_id || 0) > 0);
			console.log('[RELATIVES] PJ_USP_SELECT_RELATIVES loaded:', relatives.length);
		} catch (err) {
			// 목록 조회 실패 시 화면은 유지하고, 지인 목록만 비워서 렌더합니다.
			console.error('[RELATIVES] PJ_USP_SELECT_RELATIVES 실패:', err.message);
			relatives = [];
		}
	}

	// 사주 폼에서 본인/지인 자동입력을 할 수 있도록 선택 목록 데이터를 구성합니다.
	const sajuTargets = [];

	if (sessionUser) {
		sajuTargets.push({
			type: 'self',
			id: 'self',
			label: `본인 · ${sessionUser.user_name || sessionUser.login_id || '회원'}`,
			name: sessionUser.user_name || '',
			birthDate: profile.birthDate || '',
			birthTime: profile.birthTime || '',
			gender: profile.gender || ''
		});
	}

	relatives.forEach((relative) => {
		const relationLabel = getRelationLabel(relative.relation, locale);
		sajuTargets.push({
			type: 'relative',
			id: relative.relative_id,
			label: `${relationLabel} · ${relative.relative_name || '이름없음'}`,
			name: relative.relative_name || '',
			birthDate: normalizeDateForInput(relative.relative_birth_date),
			birthTime: normalizeTimeForInput(relative.relative_birth_time, relative.birth_time_unknown),
			gender: normalizeGenderForForm(relative.relative_gender)
		});
	});

	res.render(path.join(__dirname, './pages/index.ejs'), {
		sajuTargets
	});
};

const result = async (req, res) => {
	const resultId = String(req.params?.resultId || '');
	const record = await getSajuResultRecord(resultId);

	if (!record) {
		return res.status(404).send('결과를 찾을 수 없습니다.');
	}

	// 완료 전에는 진행상태 화면을 노출하고, 완료되면 자동 이동합니다.
	if (record.status !== 'completed') {
		return res.render(path.join(__dirname, './pages/result_pending.ejs'), {
			resultId
		});
	}

	const resultData = record.result || {};
	return res.render('home/pages/result', {
		resultId,
		claudeResult: resultData.claudeResult || '',
		name: resultData.name || '고객',
		birthInfo: resultData.birthInfo || '',
	});
};

const sharedResult = async (req, res) => {
	const shareToken = String(req.params?.shareToken || '');
	const record = await getSajuResultRecordByShareToken(shareToken);
	if (!record) {
		return res.status(404).send('공유된 상담 결과를 찾을 수 없습니다.');
	}

	if (String(record.status || '') !== 'completed') {
		return res.status(404).send('공유 가능한 상담 결과가 아닙니다.');
	}

	return res.render(path.join(__dirname, './pages/shared_result.ejs'), {
		resultId: record.resultId,
		claudeResult: record.result?.claudeResult || '',
		name: record.result?.name || '고객',
		birthInfo: record.result?.birthInfo || '',
	});
};

module.exports = {
	index,
	result,
	sharedResult
};
