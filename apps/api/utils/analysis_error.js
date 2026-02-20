function normalizeText(v) {
  return String(v || '').trim();
}

function collectStringParts(value, out = []) {
  if (value == null) return out;

  if (typeof value === 'string') {
    const text = normalizeText(value);
    if (text) out.push(text);
    return out;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStringParts(item, out));
    return out;
  }

  if (typeof value === 'object') {
    const preferredKeys = [
      'message',
      'type',
      'code',
      'error',
      'details',
      'hint',
      'status',
    ];
    preferredKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        collectStringParts(value[key], out);
      }
    });

    Object.keys(value).forEach((key) => {
      if (preferredKeys.includes(key)) return;
      collectStringParts(value[key], out);
    });
  }

  return out;
}

function parseErrorPayload(raw) {
  const text = normalizeText(raw);
  if (!text) {
    return {
      parsed: '',
      searchable: '',
      rawText: '',
    };
  }

  let parsed = text;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      parsed = text;
    }
  }

  const parts = collectStringParts(parsed, []);
  const rawText = typeof parsed === 'string'
    ? parsed
    : normalizeText(JSON.stringify(parsed));
  if (rawText) parts.push(rawText);

  const searchable = normalizeText(parts.join(' | ')).toLowerCase();

  return {
    parsed,
    searchable,
    rawText,
  };
}

function isClaudeBillingUnavailable(raw) {
  const payload = parseErrorPayload(raw);
  const lower = payload.searchable;
  if (!lower) return false;

  // Anthropic 크레딧/한도 소진 계열 에러를 넓게 감지합니다.
  if (
    lower.includes('credit balance is too low') ||
    lower.includes('insufficient credit') ||
    lower.includes('insufficient credits') ||
    lower.includes('insufficient_quota') ||
    lower.includes('quota exceeded') ||
    lower.includes('quota_exceeded') ||
    lower.includes('billing') ||
    lower.includes('payment required') ||
    lower.includes('hard limit')
  ) {
    return true;
  }

  return false;
}

function toErrorDisplay(raw) {
  const payload = parseErrorPayload(raw);
  const lower = payload.searchable;
  if (!lower) {
    return {
      message: '',
      hint: '',
      code: '',
      maintenanceMode: false,
    };
  }

  if (isClaudeBillingUnavailable(raw)) {
    return {
      code: 'CLAUDE_BILLING_UNAVAILABLE',
      message: '현재 AI 분석 서버 결제 한도 이슈로 점검 중입니다.',
      hint: '잠시 후 다시 시도해주세요. 불편을 드려 죄송합니다.',
      maintenanceMode: true,
    };
  }

  if (lower.includes('invalid_gender')) {
    return {
      code: 'INVALID_GENDER',
      message: '성별 정보가 올바르지 않아 분석에 실패했습니다.',
      hint: '입력값을 다시 확인한 뒤 재요청해주세요.',
      maintenanceMode: false,
    };
  }
  if (lower.includes('invalid_birth_input')) {
    return {
      code: 'INVALID_BIRTH_INPUT',
      message: '생년월일시 정보가 올바르지 않아 분석에 실패했습니다.',
      hint: '년/월/일/시를 모두 입력한 뒤 다시 시도해주세요.',
      maintenanceMode: false,
    };
  }
  if (lower.includes('invalid_input')) {
    return {
      code: 'INVALID_INPUT',
      message: '입력값 검증에 실패했습니다.',
      hint: '필수 입력 항목을 점검하고 재요청해주세요.',
      maintenanceMode: false,
    };
  }
  if (lower.includes('ablecity') || lower.includes('api.ablecity.kr')) {
    return {
      code: 'ABLECITY_ERROR',
      message: '사주 원본 데이터 조회 중 오류가 발생했습니다.',
      hint: '잠시 후 다시 시도해주세요. 반복되면 관리자에게 문의해주세요.',
      maintenanceMode: false,
    };
  }
  if (lower.includes('anthropic') || lower.includes('claude') || lower.includes('api.anthropic.com')) {
    return {
      code: 'CLAUDE_ERROR',
      message: 'AI 분석 서버 호출 중 오류가 발생했습니다.',
      hint: '잠시 후 다시 시도해주세요.',
      maintenanceMode: false,
    };
  }
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('econnaborted')) {
    return {
      code: 'TIMEOUT',
      message: '분석 시간이 초과되었습니다.',
      hint: '네트워크 상태를 확인한 뒤 잠시 후 재시도해주세요.',
      maintenanceMode: false,
    };
  }
  if (lower.includes('network') || lower.includes('enotfound') || lower.includes('econnreset')) {
    return {
      code: 'NETWORK',
      message: '네트워크 오류로 분석에 실패했습니다.',
      hint: '인터넷 연결 상태를 확인한 뒤 다시 시도해주세요.',
      maintenanceMode: false,
    };
  }
  if (lower.includes('token')) {
    return {
      code: 'TOKEN',
      message: '토큰 처리 중 문제가 발생했습니다.',
      hint: '토큰 잔액/변동 내역을 확인한 뒤 다시 시도해주세요.',
      maintenanceMode: false,
    };
  }
  return {
    code: 'UNKNOWN',
    message: '분석 처리 중 오류가 발생했습니다.',
    hint: '잠시 후 다시 시도해주세요.',
    maintenanceMode: false,
  };
}

module.exports = {
  toErrorDisplay,
  isClaudeBillingUnavailable,
};
