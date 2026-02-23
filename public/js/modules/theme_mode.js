function getLocaleTexts() {
  const locale = String(document?.documentElement?.lang || 'ko').trim().toLowerCase();
  if (locale.startsWith('en')) {
    return {
      light: 'Light',
      dark: 'Dark',
      switchToLight: 'Switch to light mode',
      switchToDark: 'Switch to dark mode',
    };
  }
  return {
    light: '기본',
    dark: '다크',
    switchToLight: '기본 모드로 전환',
    switchToDark: '다크 모드로 전환',
  };
}

function isDarkMode() {
  return document.documentElement.classList.contains('theme-dark');
}

function applyTheme(mode) {
  const dark = mode === 'dark';
  document.documentElement.classList.toggle('theme-dark', dark);
  try {
    localStorage.setItem('theme.mode', dark ? 'dark' : 'light');
  } catch (_) {}
  refreshToggleLabels();
}

function refreshToggleLabels() {
  const dark = isDarkMode();
  const texts = getLocaleTexts();
  const buttons = document.querySelectorAll('[data-theme-toggle]');
  buttons.forEach((btn) => {
    btn.textContent = dark ? texts.dark : texts.light;
    btn.setAttribute('title', dark ? texts.switchToLight : texts.switchToDark);
  });
}

function bindThemeToggles() {
  const buttons = document.querySelectorAll('[data-theme-toggle]');
  buttons.forEach((btn) => {
    if (btn.dataset.themeBound === '1') return;
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', () => {
      applyTheme(isDarkMode() ? 'light' : 'dark');
    });
  });
}

function initThemeMode() {
  bindThemeToggles();
  refreshToggleLabels();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeMode);
} else {
  initThemeMode();
}
