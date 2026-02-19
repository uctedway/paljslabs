function normalizeText(v) {
  return String(v || '').trim();
}

function parseErrorMessage(raw) {
  const text = normalizeText(raw);
  if (!text) return '';
  try {
    return normalizeText(JSON.parse(text));
  } catch (_) {
    return text;
  }
}

function toErrorDisplay(raw) {
  const msg = parseErrorMessage(raw);
  const lower = msg.toLowerCase();
  if (!lower) {
    return {
      message: '',
      hint: '',
      code: '',
    };
  }

  if (lower.includes('invalid_gender')) {
    return {
      code: 'INVALID_GENDER',
      message: '성별 정보가 올바르지 않아 분석에 실패했습니다.',
      hint: '입력값을 다시 확인한 뒤 재요청해주세요.',
    };
  }
  if (lower.includes('invalid_birth_input')) {
    return {
      code: 'INVALID_BIRTH_INPUT',
      message: '생년월일시 정보가 올바르지 않아 분석에 실패했습니다.',
      hint: '년/월/일/시를 모두 입력한 뒤 다시 시도해주세요.',
    };
  }
  if (lower.includes('invalid_input')) {
    return {
      code: 'INVALID_INPUT',
      message: '입력값 검증에 실패했습니다.',
      hint: '필수 입력 항목을 점검하고 재요청해주세요.',
    };
  }
  if (lower.includes('ablecity') || lower.includes('api.ablecity.kr')) {
    return {
      code: 'ABLECITY_ERROR',
      message: '사주 원본 데이터 조회 중 오류가 발생했습니다.',
      hint: '잠시 후 다시 시도해주세요. 반복되면 관리자에게 문의해주세요.',
    };
  }
  if (lower.includes('anthropic') || lower.includes('claude') || lower.includes('api.anthropic.com')) {
    return {
      code: 'CLAUDE_ERROR',
      message: 'AI 분석 서버 호출 중 오류가 발생했습니다.',
      hint: '잠시 후 다시 시도해주세요.',
    };
  }
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('econnaborted')) {
    return {
      code: 'TIMEOUT',
      message: '분석 시간이 초과되었습니다.',
      hint: '네트워크 상태를 확인한 뒤 잠시 후 재시도해주세요.',
    };
  }
  if (lower.includes('network') || lower.includes('enotfound') || lower.includes('econnreset')) {
    return {
      code: 'NETWORK',
      message: '네트워크 오류로 분석에 실패했습니다.',
      hint: '인터넷 연결 상태를 확인한 뒤 다시 시도해주세요.',
    };
  }
  if (lower.includes('token')) {
    return {
      code: 'TOKEN',
      message: '토큰 처리 중 문제가 발생했습니다.',
      hint: '토큰 잔액/변동 내역을 확인한 뒤 다시 시도해주세요.',
    };
  }
  return {
    code: 'UNKNOWN',
    message: '분석 처리 중 오류가 발생했습니다.',
    hint: '잠시 후 다시 시도해주세요.',
  };
}

module.exports = {
  toErrorDisplay,
};
