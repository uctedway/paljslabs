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
  const buttons = document.querySelectorAll('[data-theme-toggle]');
  buttons.forEach((btn) => {
    btn.textContent = dark ? '다크' : '기본';
    btn.setAttribute('title', dark ? '기본 모드로 전환' : '다크 모드로 전환');
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
