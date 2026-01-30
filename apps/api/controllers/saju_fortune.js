const axios = require('axios');

// 나이 계산 함수
function calculateAge(birthYear, birthMonth, birthDay) {
	const today = new Date();
	const birth = new Date(birthYear, birthMonth - 1, birthDay);
	let age = today.getFullYear() - birth.getFullYear();
	const monthDiff = today.getMonth() - birth.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
		age--;
	}
	return age;
}

// 생애주기 판단 함수
function getLifeStage(age) {
	if (age < 20) return '10대';
	if (age < 25) return '20대 초반';
	if (age < 28) return '20대 중반';
	if (age < 30) return '20대 후반';
	if (age < 35) return '30대 초반';
	if (age < 38) return '30대 중반';
	if (age < 40) return '30대 후반';
	if (age < 45) return '40대 초반';
	if (age < 48) return '40대 중반';
	if (age < 50) return '40대 후반';
	if (age < 55) return '50대 초반';
	if (age < 58) return '50대 중반';
	if (age < 60) return '50대 후반';
	return '60대 이상';
}

// 시스템 프롬프트
const SYSTEM_PROMPT = `# 역할
너는 20년 경력의 친근한 사주 상담사다. 전문 지식을 갖췄지만 설교하지 않고, 동네 형/언니처럼 편하게 조언한다.

# 나이 계산 및 생애주기 반영 (매우 중요!)
- 고객의 생년월일로 만 나이를 계산하라
- 나이에 따라 조언의 톤과 내용을 완전히 다르게 하라:

| 나이대 | 키워드 | 조언 방향 |
|--------|--------|----------|
| 10대 | 진로탐색, 학업, 정체성 | 가능성 강조, 부모 관계, 친구 관계 |
| 20대 | 취업, 연애, 자아실현 | 도전 권유, 연애/결혼 본격 언급 |
| 30대 | 커리어 성장, 결혼/육아, 재테크 | 안정과 도전의 균형, 가정 형성 |
| 40대 | 중년 전환기, 자녀 교육, 건강 | 제2막 준비, 건강 경고, 부부 관계 |
| 50대 | 은퇴 준비, 자녀 독립, 건강 관리 | 노후 설계, 부부만의 시간, 건강 최우선 |
| 60대+ | 인생 정리, 건강, 손주, 여유 | 지혜 존중, 무리하지 말 것, 즐거움 강조 |

- 절대 금지: 50대 이상에게 "결혼 서두르지 마세요" 같은 맥락 없는 조언
- 필수: 현재 대운과 나이를 연결해서 "지금 이 시기에는..." 형태로 조언

# 톤/문체 규칙
- 반말+존댓말 자연스럽게 혼용 ("~이네요", "~인 거죠", "~하세요")
- 고객 이름을 섹션당 1~2회 자연스럽게 호명
- 비유/은유를 적극 활용 (예: "브레이크 고장 난 스포츠카", "흙 속 다이아몬드")
- 70% 긍정 + 30% 현실적 조언의 밸런스
- 나이대에 맞는 어휘와 관심사 반영

# 전문용어 규칙
- 전체 텍스트의 8~12%만 전문용어 사용
- 전문용어는 단락 중반에 배치 (첫 문장 금지)
- 용어 등장 직후 반드시 쉬운 해석 제공
- 한 단락에 최대 2개 용어

# 섹션 구조 (13~14개 섹션, 총 8000자 내외)
각 섹션은 아래 형식을 따른다:

## [이모지] [자극적 비유], [핵심 메시지]

[도입] 강렬한 비유로 첫인상 (1~2문장)
[명리 해석] 전문용어 + 즉시 풀이 (2~3문장)  
[현실 적용] "그래서 OO님은..." 실생활 연결 (2~3문장)
[조언/개운법] 구체적 행동 제안 (1~2문장)

# 필수 섹션 (14개)
1. 종합운/핵심 성격 (첫인상 비유)
2. 성격 장점 심층
3. 성격 단점/주의점
4. 삶의 태도와 철학
5. 직업/재능 총론
6. 직업 구체 추천 (업종/분야 명시)
7. 재물운
8. 건강운 (오행 불균형 기반 취약 부위, 나이대별 주의사항)
9. 연애 스타일 (미혼인 경우) / 부부 관계 (기혼인 경우)
10. 결혼/배우자운
11. 가족운 (부모/자녀 - 나이에 따라 비중 조절)
12. 대인관계/친구운
13. 방향/거주지/개운법
14. 최종 총평 (응원 마무리)

# 건강운 작성 가이드
- 오행 과다/부족에 따른 취약 장기 언급:
  - 목(木) 부족/과다: 간, 담, 눈, 근육
  - 화(火) 부족/과다: 심장, 소장, 혈압, 정신건강
  - 토(土) 부족/과다: 위장, 비장, 소화기
  - 금(金) 부족/과다: 폐, 대장, 피부, 호흡기
  - 수(水) 부족/과다: 신장, 방광, 생식기, 귀
- 나이대별 건강 조언 필수 반영
- 구체적 생활 습관 제안 (음식, 운동, 수면 등)

# 마무리 문장 규칙 (매우 중요!)
- 절대 금지: "폼 미쳤다", "파이팅!" 같은 고정 문구 반복 사용
- 필수: 매번 다른 마무리 문장 생성
- 마무리 문장은 다음 요소를 조합해 매번 새롭게 만들 것:
  - 고객 이름 포함
  - 고객 사주의 핵심 키워드 1개 반영
  - 나이대에 맞는 응원 메시지

# 금지사항
- 교과서적/학술적 설명
- "사주란~", "명리학에서는~" 같은 개론 설명
- 부정적 내용만 나열
- 모호한 조언 (구체적 행동 제시할 것)
- 나이에 맞지 않는 조언
- 동일한 마무리 문장 반복

# 출력 포맷
- 마크다운 형식
- 제목: ## [이모지] 제목
- 본문: 줄글 (리스트 금지)`;


exports.getSajuFortune = async (req, res) => {
	const { birthYear, birthMonth, birthDay, birthTime, gender, name = '고객' } = req.body;
	
	const birth = `${birthYear}-${birthMonth}-${birthDay}T${birthTime}`;
	const age = calculateAge(parseInt(birthYear), parseInt(birthMonth), parseInt(birthDay));
	const lifeStage = getLifeStage(age);
	
	console.log('========================================');
	console.log('사주풀이 요청');
	console.log('birth:', birth);
	console.log('gender:', gender);
	console.log('age:', age);
	console.log('lifeStage:', lifeStage);
	console.log('========================================');
	
	try {
		// 1. Ablecity API 호출
		const ablecityResponse = await axios.get('https://api.ablecity.kr/api/v1/saju/fortune', {
			params: {
				birth: birth,
				gender: gender
			},
			headers: {
				'Authorization': `Bearer ${process.env.ABLECITY_API_KEY}`,
				'Accept': 'application/json'
			}
		});
		
		const sajuData = ablecityResponse.data;
		console.log('Ablecity 응답 수신 완료');
		
		// 2. Claude API 호출 (axios 직접 호출)
		const userPrompt = `# 고객 정보
- 이름: ${name}
- 성별: ${gender === 'M' ? '남성' : '여성'}
- 생년월일시: ${birthYear}년 ${birthMonth}월 ${birthDay}일 ${birthTime}시 (양력)
- 만 나이: ${age}세
- 생애주기: ${lifeStage}

# 사주 원국 데이터
\`\`\`json
${JSON.stringify(sajuData.data?.saju || sajuData, null, 2)}
\`\`\`

# 대운/세운 데이터  
\`\`\`json
${JSON.stringify(sajuData.data?.daewoon || {}, null, 2)}
\`\`\`

# 요청
위 사주 데이터를 바탕으로 종합 상담 결과를 작성해줘.
반드시 고객의 나이(${age}세)와 현재 생애주기를 고려하여 
모든 조언을 현실적이고 맥락에 맞게 작성할 것.`;

		const claudeResponse = await axios.post(
			'https://api.anthropic.com/v1/messages',
			{
				model: 'claude-sonnet-4-20250514',
				max_tokens: 8192,
				system: SYSTEM_PROMPT,
				messages: [
					{
						role: 'user',
						content: userPrompt
					}
				]
			},
			{
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': process.env.CLAUDE_API_KEY,
					'anthropic-version': '2023-06-01'
				}
			}
		);
		
		const claudeResult = claudeResponse.data.content[0].text;
		console.log('Claude 응답 수신 완료, 길이:', claudeResult.length);
		
		// 3. result 페이지로 렌더링
		res.render('home/pages/result', {
			claudeResult: claudeResult,
			name: name,
			birthInfo: `${birthYear}년 ${birthMonth}월 ${birthDay}일`
		});
		
	} catch (error) {
		console.error('API 호출 실패:', error.response?.data || error.message);
		res.status(500).json({
			status: 'error',
			message: 'API 호출 중 오류가 발생했습니다.'
		});
	}
};

exports.claudeTest = async (req, res) => {
	const apiKey = process.env.CLAUDE_API_KEY;
	
	console.log('========================================');
	console.log('Claude API 테스트');
	console.log('API Key 앞 20자:', apiKey?.substring(0, 20));
	console.log('API Key 길이:', apiKey?.length);
	console.log('========================================');
	
	try {
		const claudeResponse = await axios.post(
			'https://api.anthropic.com/v1/messages',
			{
				model: 'claude-sonnet-4-20250514',
				max_tokens: 100,
				messages: [
					{
						role: 'user',
						content: '안녕? 간단하게 인사해줘.'
					}
				]
			},
			{
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': process.env.CLAUDE_API_KEY,
					'anthropic-version': '2023-06-01'
				}
			}
		);
		
		const result = claudeResponse.data.content[0].text;
		console.log('Claude 응답:', result);
		
		res.send(result);
		
	} catch (error) {
		console.error('Claude 테스트 실패:', error.response?.data || error.message);
		res.status(500).send('에러: ' + JSON.stringify(error.response?.data || error.message));
	}
};