const SUPPORTED_LOCALES = ['ko', 'en'];
const DEFAULT_LOCALE = 'ko';

const messages = {
  ko: {
    'nav.saju': '사주풀이',
    'nav.compatibility': '궁합',
    'nav.today': '오늘의 운세',
    'nav.flow': '대운·세운',
    'nav.naming': '작명/개명',
    'nav.dateSelection': '택일',
    'nav.about': 'About',
    'common.login': '로그인',
    'common.logout': '로그아웃',
    'common.mypage': '마이페이지',
    'common.dashboard': '요약 대시보드',
    'common.profileEdit': '내 정보수정',
    'common.relatives': '지인관리',
    'common.history': '내 상담내역',
    'common.tokenCharge': '토큰충전',
    'common.purchaseHistory': '결제내역',
    'common.tokenUsageHistory': '토큰사용내역',
    'common.withdraw': '회원탈퇴',
    'common.terms': '이용약관',
    'common.privacy': '개인정보처리방침',
    'common.lang.ko': 'KO',
    'common.lang.en': 'EN',
    'common.member': '회원',
    'common.honorific': '님',
    'aria.home': '48LAB 홈',
    'aria.mypageMenu': '마이페이지 메뉴',
    'aria.gotoMypage': '마이페이지 이동',
    'aria.gotoLogin': '로그인 이동',
    'aria.toggleTheme': '테마 전환',
    'aria.gotoProfile': '개인정보수정 이동',
    'aria.closeMenu': '메뉴 닫기',
    'aria.openMypageSubmenu': '마이페이지 서브메뉴 열기',
    'header.analysis.processing': '분석 진행중',
    'header.analysis.completed': '분석 완료',
    'header.analysis.failed': '분석 실패',
    'header.analysis.completedToast': '분석이 완료되었습니다.',
    'header.analysis.completedNotifyTitle': '48LAB 분석 완료',
    'header.analysis.completedNotifyBody': '요청하신 분석이 완료되었습니다.',
    'header.analysis.failedNotifyTitle': '48LAB 분석 실패',
    'header.analysis.failedToastPrefix': '분석에 실패했습니다.',
    'header.analysis.failedDefaultMessage': '분석 처리 중 오류가 발생했습니다.',
    'header.analysis.startedTitle': '분석이 진행 중입니다.',
    'header.analysis.startedToast': '분석을 시작했습니다. 완료되면 알려드리겠습니다.',
    'header.analysis.processingTitle': '예상 남은 시간 약 {minutes}분',
    'header.analysis.completedTitle': '분석이 완료되었습니다. 클릭해서 결과를 확인하세요.',
    'theme.light': '기본',
    'theme.dark': '다크',
    'theme.switchToLight': '기본 모드로 전환',
    'theme.switchToDark': '다크 모드로 전환',
    'footer.company': '이상단 주식회사',
    'footer.addressLine1': '경기도 용인시 기흥구 기흥로 58, 제비동 B122호',
    'footer.addressLine2': '(구갈동, 기흥아이씨티밸리에스케이브이원)',
    'footer.emailLabel': '이메일',
  },
  en: {
    'nav.saju': 'Saju Reading',
    'nav.compatibility': 'Compatibility',
    'nav.today': 'Today Fortune',
    'nav.flow': 'Luck Flow',
    'nav.naming': 'Name Support',
    'nav.dateSelection': 'Date Selection',
    'nav.about': 'About',
    'common.login': 'Login',
    'common.logout': 'Logout',
    'common.mypage': 'My Page',
    'common.dashboard': 'Dashboard',
    'common.profileEdit': 'Edit Profile',
    'common.relatives': 'Contacts',
    'common.history': 'History',
    'common.tokenCharge': 'Token Top-up',
    'common.purchaseHistory': 'Purchase History',
    'common.tokenUsageHistory': 'Token Usage',
    'common.withdraw': 'Withdraw Account',
    'common.terms': 'Terms',
    'common.privacy': 'Privacy Policy',
    'common.lang.ko': 'KO',
    'common.lang.en': 'EN',
    'common.member': 'Member',
    'common.honorific': '',
    'aria.home': 'Go to 48LAB home',
    'aria.mypageMenu': 'My page menu',
    'aria.gotoMypage': 'Go to My Page',
    'aria.gotoLogin': 'Go to Login',
    'aria.toggleTheme': 'Toggle theme',
    'aria.gotoProfile': 'Go to Profile Edit',
    'aria.closeMenu': 'Close menu',
    'aria.openMypageSubmenu': 'Open my page submenu',
    'header.analysis.processing': 'Analyzing',
    'header.analysis.completed': 'Completed',
    'header.analysis.failed': 'Failed',
    'header.analysis.completedToast': 'Analysis completed.',
    'header.analysis.completedNotifyTitle': '48LAB Analysis Complete',
    'header.analysis.completedNotifyBody': 'Your requested analysis is ready.',
    'header.analysis.failedNotifyTitle': '48LAB Analysis Failed',
    'header.analysis.failedToastPrefix': 'Analysis failed.',
    'header.analysis.failedDefaultMessage': 'An error occurred during analysis.',
    'header.analysis.startedTitle': 'Analysis is in progress.',
    'header.analysis.startedToast': 'Analysis started. We will notify you when it is complete.',
    'header.analysis.processingTitle': 'Estimated remaining time: {minutes} min',
    'header.analysis.completedTitle': 'Analysis completed. Click to view result.',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.switchToLight': 'Switch to light mode',
    'theme.switchToDark': 'Switch to dark mode',
    'footer.company': 'Leesangdan Co., Ltd.',
    'footer.addressLine1': '58 Giheung-ro, Giheung-gu, Yongin-si, Gyeonggi-do, Bldg B, B122',
    'footer.addressLine2': '(Gugal-dong, Giheung ICT Valley SK V1)',
    'footer.emailLabel': 'Email',
  },
};

function normalizeLocale(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('ko')) return 'ko';
  return '';
}

function stripLocalePrefix(pathname) {
  const path = String(pathname || '').trim() || '/';
  if (path === '/en' || path.startsWith('/en/')) {
    const stripped = path.slice(3) || '/';
    return {
      localeFromPath: 'en',
      pathname: stripped.startsWith('/') ? stripped : `/${stripped}`,
    };
  }
  return { localeFromPath: '', pathname: path };
}

function resolveLocale(req, { skipSession = false } = {}) {
  const forced = normalizeLocale(req?._forcedLocale || req?.locals?._forcedLocale);
  if (forced) {
    if (!skipSession && req?.session) req.session.locale = forced;
    return forced;
  }
  const q = normalizeLocale(req?.query?.lang);
  if (q && !skipSession && req?.session) {
    req.session.locale = q;
    return q;
  }
  const sessionLocale = skipSession ? '' : normalizeLocale(req?.session?.locale);
  if (sessionLocale) return sessionLocale;
  const accept = normalizeLocale(req?.headers?.['accept-language']);
  if (accept) return accept;
  return DEFAULT_LOCALE;
}

function t(locale, key, params = null) {
  const current = messages[locale] || messages[DEFAULT_LOCALE];
  const fallback = messages[DEFAULT_LOCALE];
  let text = String(current[key] || fallback[key] || key);
  if (params && typeof params === 'object') {
    Object.keys(params).forEach((k) => {
      text = text.replaceAll(`{${k}}`, String(params[k]));
    });
  }
  return text;
}

function buildLangUrl(req, targetLocale) {
  const loc = SUPPORTED_LOCALES.includes(targetLocale) ? targetLocale : DEFAULT_LOCALE;
  const original = String(req?.originalUrl || req?.url || '/');
  const [rawPath, queryRaw] = original.split('?');
  const stripped = stripLocalePrefix(rawPath);
  const path = stripped.pathname || '/';
  const query = new URLSearchParams(queryRaw || '');
  query.delete('lang');
  const qs = query.toString();
  const prefixed = loc === 'en'
    ? (path === '/' ? '/en' : `/en${path}`)
    : path;
  // Switching from /en/* to Korean default needs one explicit signal to clear EN session locale.
  if (loc === 'ko' && stripped.localeFromPath === 'en') {
    query.set('lang', 'ko');
    const forceKoQs = query.toString();
    return forceKoQs ? `${path}?${forceKoQs}` : path;
  }
  return qs ? `${prefixed}?${qs}` : prefixed;
}

function ogLocaleByLocale(locale) {
  return locale === 'en' ? 'en_US' : 'ko_KR';
}

module.exports = {
  resolveLocale,
  normalizeLocale,
  t,
  buildLangUrl,
  stripLocalePrefix,
  ogLocaleByLocale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
};
