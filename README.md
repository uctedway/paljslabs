# 사주 상담 서비스

## 설치

```bash
npm install
```

## 실행

### 개발 모드
```bash
npm run dev
```

### SCSS 컴파일 (별도 터미널)
```bash
npm run sass
```

### 프로덕션
```bash
npm start
```

## 구조

```
├── web.js              # 메인 서버
├── package.json
├── apps/
│   ├── home/           # 홈 앱
│   ├── user/           # 유저 앱
│   ├── api/            # API 앱
│   └── core/           # 공통 (레이아웃)
└── public/
    ├── css/            # 컴파일된 CSS
    └── scss/           # SCSS 소스
```
