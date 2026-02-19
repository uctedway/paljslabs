# 48LAB

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

## URL 환경변수

- `APP_ORIGIN`: 서비스의 절대 루트 URL (예: `https://example.com`)
- `APP_BASE_PATH`: 선택값. 서비스가 하위 경로에서 동작할 때만 설정 (예: `/service`)

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
