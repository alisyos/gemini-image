# Gemini AI 이미지 생성기

Google Gemini API를 활용한 AI 이미지 생성 웹 애플리케이션입니다. 사용자가 입력한 텍스트 프롬프트를 기반으로 AI가 실제 이미지를 생성합니다.

## 🎨 주요 기능

- **실제 이미지 생성**: Gemini 2.5 Flash Image Preview 모델을 사용한 네이티브 이미지 생성
- **이미지 다운로드**: 생성된 이미지를 PNG 형식으로 다운로드
- **프롬프트 길이 제한**: 2000자 제한으로 안정적인 처리 (실시간 문자 수 카운터)
- **요청 타임아웃 관리**: 30초 타임아웃으로 안정적인 API 호출
- **자동 재시도**: 실패 시 최대 3회 자동 재시도 기능
- **실시간 생성 상태 표시**: 로딩 애니메이션 및 진행 상태 표시
- **반응형 웹 디자인**: 모바일과 데스크톱 모두 최적화
- **향상된 에러 처리**: 사용자 친화적인 에러 메시지 및 해결 방안 제시

## 🛠 기술 스택

- **Next.js 15** - React 프레임워크
- **TypeScript** - 타입 안정성
- **Tailwind CSS** - 스타일링
- **Google Gemini API** - AI 이미지 생성 (gemini-2.5-flash-image-preview)
- **@google/genai** - Gemini SDK for 이미지 생성

## 시작하기

### 필수 요구사항

- Node.js 18.0 이상
- npm 또는 yarn
- Google Gemini API 키

### 설치

1. 저장소 클론:
```bash
git clone [repository-url]
cd gemini-image-generator
```

2. 의존성 설치:
```bash
npm install
```

3. 환경 변수 설정:
`.env.local` 파일을 생성하고 Gemini API 키를 추가합니다:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

### 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 애플리케이션을 확인할 수 있습니다.

## Vercel 배포 가이드

### 1. GitHub에 코드 푸시

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin [your-github-repo-url]
git push -u origin main
```

### 2. Vercel에 배포

1. [Vercel](https://vercel.com)에 로그인
2. "New Project" 클릭
3. GitHub 저장소 연결
4. 환경 변수 설정:
   - Key: `GEMINI_API_KEY`
   - Value: `your_actual_gemini_api_key`
5. "Deploy" 클릭

### 3. 환경 변수 설정 (Vercel Dashboard)

1. Vercel 프로젝트 설정으로 이동
2. "Environment Variables" 섹션
3. 다음 변수 추가:
   - `GEMINI_API_KEY`: Google AI Studio에서 발급받은 API 키

## API 키 발급 방법

1. [Google AI Studio](https://makersuite.google.com/app/apikey) 방문
2. Google 계정으로 로그인
3. "Get API Key" 클릭
4. 새 API 키 생성
5. 생성된 키를 안전하게 보관

## 프로젝트 구조

```
gemini-image-generator/
├── app/
│   ├── api/
│   │   └── generate-image/
│   │       └── route.ts      # Gemini API 엔드포인트
│   ├── page.tsx              # 메인 페이지 UI
│   ├── layout.tsx            # 레이아웃 컴포넌트
│   └── globals.css           # 전역 스타일
├── public/                   # 정적 파일
├── .env.local               # 환경 변수 (Git 제외)
├── .env.example             # 환경 변수 예시
└── package.json             # 프로젝트 설정
```

## ⚠️ 주의사항

- **API 키 보안**: `.env.local` 파일을 절대 Git에 커밋하지 마세요
- **사용량 제한**: Gemini API의 무료 사용량 제한을 확인하세요
- **이미지 생성 모델**: `gemini-2.5-flash-image-preview` 모델 사용 (최신 이미지 생성 기능)
- **이미지 형식**: 생성된 이미지는 PNG 형식으로 Base64 인코딩되어 제공됩니다

## 문제 해결

### API 키 오류
- API 키가 올바르게 설정되었는지 확인
- Vercel 환경 변수가 제대로 설정되었는지 확인

### 빌드 오류
```bash
npm run build
```
로컬에서 빌드 테스트 실행

## 라이선스

MIT
