exports.getSajuFortune = async (req, res) => {
	const { birthYear, birthMonth, birthDay, birthTime, gender } = req.body;
	
	const birth = `${birthYear}-${birthMonth}-${birthDay}T${birthTime}`;
	
	console.log('========================================');
	console.log('사주풀이 요청');
	console.log('birth:', birth);
	console.log('gender:', gender);
	console.log('========================================');
	
	try {
		const apiUrl = `https://api.ablecity.kr/api/v1/saju/fortune?birth=${encodeURIComponent(birth)}&gender=${gender}`;
		
		const response = await fetch(apiUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${process.env.ABLECITY_API_KEY}`,
				'Accept': 'application/json'
			}
		});
		
		const result = await response.json();
		
		console.log('Ablecity 응답:', JSON.stringify(result, null, 2));
		
		res.json(result);
		
	} catch (error) {
		console.error('API 호출 실패:', error);
		res.status(500).json({
			status: 'error',
			message: 'API 호출 중 오류가 발생했습니다.'
		});
	}
};