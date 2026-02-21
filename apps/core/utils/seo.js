function normalizeText(v) {
  return String(v || '').trim();
}

function stripTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function getSiteOrigin(req) {
  const envOrigin = stripTrailingSlash(process.env.APP_ORIGIN);
  if (envOrigin) return envOrigin;
  const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http').split(',')[0].trim();
  const host = String(req?.headers?.['x-forwarded-host'] || req?.get?.('host') || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}`;
}

function normalizePath(pathname) {
  const p = String(pathname || '').split('?')[0].trim();
  if (!p) return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

function buildCanonicalUrl(req, pathOnly) {
  const origin = getSiteOrigin(req);
  const path = normalizePath(pathOnly || req?.originalUrl || req?.path || '/');
  return `${stripTrailingSlash(origin)}${path}`;
}

function getSeoByPath(pathname) {
  const path = normalizePath(pathname);
  const defaults = {
    title: '48LAB | 사주 · 운세 분석 플랫폼',
    description: '48LAB에서 사주, 궁합, 오늘의 운세, 대운·세운, 작명/개명, 택일 분석을 확인하세요.',
    keywords: '48LAB, 사주, 운세, 궁합, 오늘의 운세, 대운, 세운, 작명, 개명, 택일',
    noindex: false,
    ogType: 'website',
  };

  const map = {
    '/': {
      title: '48LAB | 사주 · 운세 분석 플랫폼',
      description: '사주와 운세를 기반으로 오늘의 선택을 도와주는 48LAB 서비스입니다.',
    },
    '/saju': {
      title: '사주풀이 | 48LAB',
      description: '사주 원국과 흐름을 바탕으로 성향, 관계, 커리어, 재정의 포인트를 확인하세요.',
    },
    '/fortune': {
      title: '운세 서비스 | 48LAB',
      description: '궁합, 오늘의 운세, 대운·세운, 작명/개명, 택일 서비스를 한 곳에서 이용하세요.',
    },
    '/fortune/compatibility': {
      title: '궁합 분석 | 48LAB',
      description: '두 사람의 관계 흐름과 갈등/시너지 포인트를 현실적으로 분석합니다.',
    },
    '/fortune/today': {
      title: '오늘의 운세 | 48LAB',
      description: '오늘 하루의 핵심 흐름과 실천 포인트를 빠르게 확인하세요.',
    },
    '/fortune/flow': {
      title: '대운·세운 분석 | 48LAB',
      description: '중장기 흐름을 기반으로 시기별 전략과 의사결정 포인트를 제공합니다.',
    },
    '/fortune/naming': {
      title: '작명/개명 보조 | 48LAB',
      description: '원국 보완 방향을 기준으로 이름 후보를 비교하고 선택 근거를 정리하세요.',
    },
    '/fortune/date-selection': {
      title: '택일 분석 | 48LAB',
      description: '이사·계약·개업 등 목적에 맞는 날짜와 시간 후보를 비교해보세요.',
    },
    '/terms': {
      title: '이용약관 | 48LAB',
      description: '48LAB 서비스 이용약관 안내 페이지입니다.',
    },
    '/privacy-policy': {
      title: '개인정보처리방침 | 48LAB',
      description: '48LAB 개인정보처리방침 안내 페이지입니다.',
    },
    '/system-maintenance': {
      title: '시스템 점검 안내 | 48LAB',
      description: '48LAB 서비스 점검 및 장애 공지 페이지입니다.',
      noindex: true,
    },
  };

  const matched = map[path] || {};
  const seo = { ...defaults, ...matched };

  if (
    path.startsWith('/manage')
    || path.startsWith('/api')
    || path.startsWith('/user')
    || path.startsWith('/saju/result')
    || path.startsWith('/saju/shared')
    || path.startsWith('/fortune/result')
  ) {
    seo.noindex = true;
  }

  return seo;
}

function buildStructuredData(req, seo) {
  const origin = getSiteOrigin(req);
  const canonical = buildCanonicalUrl(req);
  const siteName = '48LAB';
  const items = [];

  items.push({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: origin,
    logo: `${origin}/images/main_logo.png`,
  });

  items.push({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: origin,
    inLanguage: 'ko-KR',
  });

  items.push({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: seo.title,
    description: seo.description,
    url: canonical,
    inLanguage: 'ko-KR',
  });

  if (normalizePath(req?.path) === '/') {
    items.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '48LAB에서 어떤 운세 서비스를 제공하나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '사주풀이, 궁합, 오늘의 운세, 대운·세운, 작명/개명 보조, 택일 서비스를 제공합니다.',
          },
        },
        {
          '@type': 'Question',
          name: '결과는 어떻게 활용하면 좋나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '결정의 정답을 대신하기보다, 선택 기준과 우선순위를 정리하는 참고 자료로 활용할 수 있습니다.',
          },
        },
      ],
    });
  }

  return items;
}

function buildSeo(req, overrides = {}) {
  const byPath = getSeoByPath(req?.path);
  const seo = {
    ...byPath,
    ...overrides,
  };
  seo.title = normalizeText(seo.title) || byPath.title;
  seo.description = normalizeText(seo.description) || byPath.description;
  seo.keywords = normalizeText(seo.keywords) || byPath.keywords;
  seo.canonical = normalizeText(seo.canonical) || buildCanonicalUrl(req);
  seo.image = normalizeText(seo.image) || `${getSiteOrigin(req)}/images/main_logo.png`;
  seo.robots = seo.noindex ? 'noindex, nofollow, noarchive' : 'index, follow, max-image-preview:large';
  seo.structuredData = Array.isArray(seo.structuredData) ? seo.structuredData : buildStructuredData(req, seo);
  return seo;
}

module.exports = {
  buildSeo,
  getSiteOrigin,
};
