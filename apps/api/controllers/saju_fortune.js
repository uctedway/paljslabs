exports.getSajuFortune = (req, res) => {
	const { birthYear, birthMonth, birthDay, birthTime, gender } = req.body;
	
	const birth = `${birthYear}-${birthMonth}-${birthDay}T${birthTime}`;
	
	console.log('========================================');
	console.log('사주풀이 요청');
	console.log('birthYear:', birthYear);
	console.log('birthMonth:', birthMonth);
	console.log('birthDay:', birthDay);
	console.log('birthTime:', birthTime);
	console.log('gender:', gender);
	console.log('birth (조합):', birth);
	console.log('========================================');
	
	res.json({
		status: 'success',
		data: {
			birthYear,
			birthMonth,
			birthDay,
			birthTime,
			gender,
			birth
		}
	});
};