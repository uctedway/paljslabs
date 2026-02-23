import GlobalLoading from './global_loading.js';

const IS_EN = String(document?.documentElement?.lang || '').toLowerCase().startsWith('en');
const L = (ko, en) => (IS_EN ? en : ko);
const RELATION_LABEL_MAP = {
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

function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function toRelationLabel(rawCodeOrLabel) {
  const v = String(rawCodeOrLabel || '').trim();
  if (!v) return '';
  return RELATION_LABEL_MAP[v.toUpperCase()] || v;
}

function buildBirthData(year, month, day, time) {
  return `${String(year || '').trim()}-${String(month || '').trim()}-${String(day || '').trim()} ${String(time || '').trim()}`.trim();
}

export function initFortuneForm({ sajuTargets = [] } = {}) {
  const form = document.getElementById('fortuneForm');
  if (!form) return;

  const feature = String(form.dataset.feature || '').trim();
  if (feature === 'compatibility') {
    initCompatibilityForm(form, sajuTargets || []);
    return;
  }

  initSinglePersonFortuneForm(form, feature, sajuTargets || []);
}

function initSinglePersonFortuneForm(form, feature, sajuTargets) {
  const currentYear = new Date().getFullYear();
  const person = buildPersonRefs('single', currentYear);
  setupDateSelects(person, currentYear);
  setupTargetAutoFill(person, sajuTargets);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateSinglePerson(feature, person)) return;

    await askAndSaveDirectInput(person);

    const payload = {
      name: String(person.nameInput?.value || '').trim(),
      gender: String(person.genderSelect?.value || '').trim(),
      birthData: buildBirthData(person.yearSelect?.value, person.monthSelect?.value, person.daySelect?.value, person.timeSelect?.value),
      birthYear: String(person.yearSelect?.value || '').trim(),
      birthMonth: String(person.monthSelect?.value || '').trim(),
      birthDay: String(person.daySelect?.value || '').trim(),
      birthTime: String(person.timeSelect?.value || '').trim(),
      target: String(person.targetSelect?.value || ''),
      relative_id: String(person.relativeIdInput?.value || '0'),
    };

    if (feature === 'today') {
      payload.focusArea = String(form.querySelector('#focusArea')?.value || '').trim();
    } else if (feature === 'flow') {
      payload.targetPeriod = String(form.querySelector('#targetPeriod')?.value || '').trim();
    } else if (feature === 'naming') {
      payload.candidateName = String(form.querySelector('#candidateName')?.value || '').trim();
    } else if (feature === 'date-selection') {
      payload.eventType = String(form.querySelector('#eventType')?.value || '').trim();
      payload.candidateDate = String(form.querySelector('#candidateDate')?.value || '').trim();
    }

    await requestFortune(feature, payload);
  });
}

function validateSinglePerson(feature, person) {
  const required = [
    person.nameInput,
    person.yearSelect,
    person.monthSelect,
    person.daySelect,
    person.timeSelect,
    person.genderSelect,
  ];

  for (const input of required) {
    if (!input) continue;
    if (!String(input.value || '').trim()) {
      input.focus();
      alert(L('필수값을 모두 입력해주세요.', 'Please fill in all required fields.'));
      return false;
    }
  }

  if (feature === 'today' && !String(document.getElementById('focusArea')?.value || '').trim()) {
    alert(L('집중 영역을 선택해주세요.', 'Please select focus area.'));
    return false;
  }
  if (feature === 'flow' && !String(document.getElementById('targetPeriod')?.value || '').trim()) {
    alert(L('대상 기간을 선택해주세요.', 'Please select target period.'));
    return false;
  }
  if (feature === 'naming' && !String(document.getElementById('candidateName')?.value || '').trim()) {
    alert(L('검토할 이름 후보를 입력해주세요.', 'Please enter a name candidate.'));
    return false;
  }
  if (feature === 'date-selection') {
    if (!String(document.getElementById('eventType')?.value || '').trim()) {
      alert(L('목적을 선택해주세요.', 'Please select purpose.'));
      return false;
    }
    if (!String(document.getElementById('candidateDate')?.value || '').trim()) {
      alert(L('후보 일시를 입력해주세요.', 'Please enter candidate date/time.'));
      return false;
    }
  }

  return true;
}

function initCompatibilityForm(form, sajuTargets) {
  const currentYear = new Date().getFullYear();
  const relationshipSelect = document.getElementById('relationship');
  const relationshipAutoHint = document.getElementById('relationshipAutoHint');

  const panels = {
    person1: buildPersonRefs('person1', currentYear),
    person2: buildPersonRefs('person2', currentYear),
  };

  initTabs();
  setupDateSelects(panels.person1, currentYear);
  setupDateSelects(panels.person2, currentYear);
  setupTargetAutoFill(panels.person1, sajuTargets, updateRelationshipAuto);
  setupTargetAutoFill(panels.person2, sajuTargets, updateRelationshipAuto);
  updateRelationshipAuto();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateCompatibility(panels, relationshipSelect)) return;

    await askAndSaveDirectInput(panels.person1);
    await askAndSaveDirectInput(panels.person2);

    const payload = buildCompatibilityPayload(panels, relationshipSelect);
    await requestFortune('compatibility', payload);
  });

  function updateRelationshipAuto() {
    const p1 = panels.person1.currentTarget;
    const p2 = panels.person2.currentTarget;
    const selfAndRelative =
      (p1?.type === 'self' && p2?.type === 'relative') ||
      (p1?.type === 'relative' && p2?.type === 'self');

    if (selfAndRelative) {
      const relative = p1?.type === 'relative' ? p1 : p2;
      if (relative?.relationCode) {
        relationshipSelect.value = relative.relationCode;
        relationshipAutoHint.textContent = IS_EN
          ? `Relationship auto-selected from me/contact pair: ${toRelationLabel(relative.relationLabel || relative.relationCode)}`
          : `나와 지인 궁합으로 관계가 자동 설정되었습니다: ${toRelationLabel(relative.relationLabel || relative.relationCode)}`;
        return;
      }
    }

    relationshipAutoHint.textContent = L(
      '지인-지인 또는 직접입력 조합이면 관계를 직접 선택해주세요.',
      'If both are contacts or manual inputs, please select relationship manually.'
    );
  }
}

function buildPersonRefs(prefix, currentYear) {
  return {
    prefix,
    targetSelect: document.getElementById(`${prefix}Target`),
    relativeIdInput: document.getElementById(`${prefix}RelativeId`),
    nameInput: document.getElementById(`${prefix}Name`),
    yearSelect: document.getElementById(`${prefix}BirthYear`),
    monthSelect: document.getElementById(`${prefix}BirthMonth`),
    daySelect: document.getElementById(`${prefix}BirthDay`),
    timeSelect: document.getElementById(`${prefix}BirthTime`),
    genderSelect: document.getElementById(`${prefix}Gender`),
    currentTarget: null,
    currentYear,
  };
}

function setupDateSelects(person, currentYear) {
  if (!person.yearSelect || !person.monthSelect || !person.daySelect) return;

  for (let year = currentYear; year >= 1920; year--) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = IS_EN ? String(year) : `${year}년`;
    person.yearSelect.appendChild(option);
  }

  for (let month = 1; month <= 12; month++) {
    const option = document.createElement('option');
    option.value = String(month).padStart(2, '0');
    option.textContent = IS_EN ? String(month) : `${month}월`;
    person.monthSelect.appendChild(option);
  }

  const updateDays = () => {
    const year = parseInt(person.yearSelect.value || String(currentYear), 10);
    const month = parseInt(person.monthSelect.value || '1', 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const currentDay = person.daySelect.value;
    person.daySelect.innerHTML = `<option value="">${L('일', 'Day')}</option>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const option = document.createElement('option');
      option.value = String(day).padStart(2, '0');
      option.textContent = IS_EN ? String(day) : `${day}일`;
      person.daySelect.appendChild(option);
    }

    if (currentDay && parseInt(currentDay, 10) <= daysInMonth) {
      person.daySelect.value = currentDay;
    }
  };

  person.yearSelect.addEventListener('change', updateDays);
  person.monthSelect.addEventListener('change', updateDays);
  updateDays();
  person.updateDays = updateDays;
}

function setupTargetAutoFill(person, sajuTargets, afterChange) {
  if (!person.targetSelect) return;

  person.targetSelect.addEventListener('change', () => {
    const selected = String(person.targetSelect.value || '');
    if (!selected) {
      person.currentTarget = null;
      if (person.relativeIdInput) person.relativeIdInput.value = '0';
      afterChange?.();
      return;
    }

    const [type, id] = selected.split(':');
    const target = (sajuTargets || []).find((item) => String(item.type) === type && String(item.id) === String(id));
    if (!target) return;

    person.currentTarget = target;
    if (type === 'relative' && person.relativeIdInput) {
      person.relativeIdInput.value = String(toPositiveInt(id));
    } else if (person.relativeIdInput) {
      person.relativeIdInput.value = '0';
    }

    if (!target.birthDate) {
      alert(L('선택한 대상의 생년월일시 정보가 없습니다. 마이페이지에서 먼저 입력해주세요.', 'Selected target has no birth data. Please update it in My Page first.'));
      person.targetSelect.value = '';
      person.currentTarget = null;
      if (person.relativeIdInput) person.relativeIdInput.value = '0';
      afterChange?.();
      return;
    }

    const [yy, mm, dd] = String(target.birthDate).split('-');
    if (person.yearSelect) person.yearSelect.value = yy || '';
    if (person.monthSelect) person.monthSelect.value = mm || '';
    if (typeof person.updateDays === 'function') person.updateDays();
    if (person.daySelect) person.daySelect.value = dd || '';
    if (person.nameInput) person.nameInput.value = String(target.name || '').trim();
    if (person.timeSelect) person.timeSelect.value = normalizeBirthTimeValue(target.birthTime) || '99:99:99';
    if (person.genderSelect) person.genderSelect.value = String(target.gender || '');

    afterChange?.();
  });
}

function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  if (tabButtons.length === 0) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = String(btn.dataset.tabTarget || '');
      document.querySelectorAll('.compat-panel').forEach((panel) => {
        panel.style.display = panel.id === targetId ? '' : 'none';
      });
      tabButtons.forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function validateCompatibility(panels, relationshipSelect) {
  const required = [
    panels.person1.nameInput,
    panels.person1.yearSelect,
    panels.person1.monthSelect,
    panels.person1.daySelect,
    panels.person1.timeSelect,
    panels.person1.genderSelect,
    panels.person2.nameInput,
    panels.person2.yearSelect,
    panels.person2.monthSelect,
    panels.person2.daySelect,
    panels.person2.timeSelect,
    panels.person2.genderSelect,
    relationshipSelect,
  ];

  for (const input of required) {
    if (!input) continue;
    if (!String(input.value || '').trim()) {
      input.focus();
      alert(L('필수값을 모두 입력해주세요.', 'Please fill in all required fields.'));
      return false;
    }
  }

  return true;
}

function buildCompatibilityPayload(panels, relationshipSelect) {
  const person1 = panels.person1;
  const person2 = panels.person2;

  return {
    relationship: String(relationshipSelect?.value || ''),
    person1Target: String(person1.targetSelect?.value || ''),
    person1RelativeId: String(person1.relativeIdInput?.value || '0'),
    person1Name: String(person1.nameInput?.value || '').trim(),
    person1BirthYear: String(person1.yearSelect?.value || ''),
    person1BirthMonth: String(person1.monthSelect?.value || ''),
    person1BirthDay: String(person1.daySelect?.value || ''),
    person1BirthTime: String(person1.timeSelect?.value || ''),
    person1Gender: String(person1.genderSelect?.value || ''),
    person2Target: String(person2.targetSelect?.value || ''),
    person2RelativeId: String(person2.relativeIdInput?.value || '0'),
    person2Name: String(person2.nameInput?.value || '').trim(),
    person2BirthYear: String(person2.yearSelect?.value || ''),
    person2BirthMonth: String(person2.monthSelect?.value || ''),
    person2BirthDay: String(person2.daySelect?.value || ''),
    person2BirthTime: String(person2.timeSelect?.value || ''),
    person2Gender: String(person2.genderSelect?.value || ''),
  };
}

function askRelationCodeWithModal(name) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '4000';

    const box = document.createElement('div');
    box.style.width = 'min(420px, calc(100% - 32px))';
    box.style.background = '#fff';
    box.style.borderRadius = '12px';
    box.style.padding = '16px';
    box.style.boxShadow = '0 18px 50px rgba(0,0,0,0.2)';

    const title = document.createElement('h3');
    title.textContent = L('지인 등록', 'Add Contact');
    title.style.margin = '0 0 8px';
    title.style.fontSize = '18px';

    const desc = document.createElement('p');
    desc.textContent = IS_EN ? `Select relation for ${name}.` : `${name}님의 관계를 선택해주세요.`;
    desc.style.margin = '0 0 12px';
    desc.style.color = '#475569';

    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.padding = '10px';
    select.style.border = '1px solid #cbd5e1';
    select.style.borderRadius = '8px';

    Object.entries(RELATION_LABEL_MAP).forEach(([code, label]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = label;
      if (code === 'FRIEND') option.selected = true;
      select.appendChild(option);
    });

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = L('취소', 'Cancel');
    cancelBtn.style.padding = '8px 12px';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = L('저장', 'Save');
    confirmBtn.style.padding = '8px 12px';

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    box.appendChild(title);
    box.appendChild(desc);
    box.appendChild(select);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close(result) {
      overlay.remove();
      resolve(result || null);
    }

    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => close(String(select.value || 'FRIEND')));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });
  });
}

async function askAndSaveDirectInput(person) {
  const selectedTarget = String(person.targetSelect?.value || '').trim();
  const relativeId = toPositiveInt(person.relativeIdInput?.value);
  if (selectedTarget || relativeId > 0) return;

  const name = String(person.nameInput?.value || '').trim();
  const birthYear = String(person.yearSelect?.value || '').trim();
  const birthMonth = String(person.monthSelect?.value || '').trim();
  const birthDay = String(person.daySelect?.value || '').trim();
  const birthTime = String(person.timeSelect?.value || '').trim();
  const gender = String(person.genderSelect?.value || '').trim();
  if (!name || !birthYear || !birthMonth || !birthDay || !birthTime || !gender) return;

  const shouldSave = window.confirm(IS_EN ? `Save ${name} as a contact?` : `${name} 정보를 지인으로 저장하시겠습니까?`);
  if (!shouldSave) return;

  const relationCode = await askRelationCodeWithModal(name);
  if (!relationCode) return;

  fetch('/api/saju/target/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      save_as: 'relative',
      relation: relationCode,
      name,
      birthYear,
      birthMonth,
      birthDay,
      birthTime,
      gender,
    }),
  }).catch(() => {});
}

function askTrialFallback(currentTokens, trialRequired = 3) {
  const current = Number(currentTokens || 0);
  if (!Number.isFinite(current) || current < trialRequired) {
    alert(L('토큰이 부족합니다. 토큰 충전 후 프리미엄 분석을 이용해주세요.', 'Insufficient tokens. Please top up and try premium analysis.'));
    window.location.href = '/user/billing';
    return false;
  }
  return window.confirm(
    IS_EN
      ? `Premium analysis requires 10 tokens.\nYou have ${current} tokens. Proceed with trial analysis (${trialRequired} tokens)?`
      : `프리미엄 분석(10토큰)이 부족합니다.\n현재 ${current}토큰으로 체험 분석(${trialRequired}토큰)을 진행할까요?`
  );
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

async function requestFortune(feature, payload) {
  GlobalLoading.show(L('요청을 접수하고 있습니다.', 'Request received.'), L('분석을 시작합니다.', 'Starting analysis.'));

  try {
    const requestPayload = { ...(payload || {}), analysis_mode: 'PREMIUM', locale: getCurrentLocale() };
    let response = await fetch(`/api/fortune/${encodeURIComponent(feature)}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(requestPayload),
    });
    let json = await response.json();

    if (!response.ok || json.resp !== 'OK') {
      if (response.status === 402) {
        const wantsTrial = askTrialFallback(json.current_tokens, 3);
        if (wantsTrial) {
          requestPayload.analysis_mode = 'TRIAL';
          response = await fetch(`/api/fortune/${encodeURIComponent(feature)}/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(requestPayload),
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
        headerTokenEl.textContent = Number(json.current_tokens || 0).toLocaleString(IS_EN ? 'en-US' : 'ko-KR');
      }
    }

    GlobalLoading.setMessage(
      L('분석을 시작합니다.', 'Analysis started.'),
      L('분석이 완료되면 알려드리겠습니다.', 'We will notify you when it is complete.')
    );
    window.dispatchEvent(new CustomEvent('analysis:started', {
      detail: {
        resultId: String(json.result_id || ''),
        serviceType: 'fortune',
      },
    }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    GlobalLoading.hide();
  } catch (err) {
    GlobalLoading.hide();
    alert(L('요청 처리 중 오류가 발생했습니다.', 'An error occurred while processing your request.'));
  }
}
