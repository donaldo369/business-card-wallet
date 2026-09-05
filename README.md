# 명함 지갑 (Business Card Wallet)

명함을 촬영·스캔해 OCR로 정보를 뽑고, 그룹으로 정리해 보관하는 Next.js 앱입니다.
데이터베이스·인증·이미지 저장은 Supabase를 씁니다.

## 개발 서버

```bash
npm install
npm run dev
```

http://localhost:3000 을 엽니다.

## Supabase 설정

### 새 프로젝트에 처음 붙이는 경우

1. https://database.new 에서 Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase_setup.sql` 전체를 실행합니다.
   테이블 3개(`business_cards`, `card_groups`, `card_group_members`)와 RLS 정책,
   `card-images` 스토리지 버킷이 만들어집니다.
3. 아래 환경변수를 설정합니다.

### 환경변수

| 이름 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable 키 |

로컬은 `.env.local`, 배포는 Vercel 환경변수에 넣습니다.
`NEXT_PUBLIC_*` 는 빌드 시점에 번들에 포함되므로 값을 바꾸면 **재배포**해야 반영됩니다.

### 설정 우선순위 (주의)

`src/lib/supabase.js`의 접속 설정은 다음 순서로 결정됩니다.

1. 앱 내 **설정 모달**에 입력해 브라우저 `localStorage`에 저장한 값 — **가장 우선**
2. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 환경변수

즉 설정 모달에 값을 한 번 저장한 브라우저는 환경변수를 바꿔도 계속 저장된 값을 씁니다.
접속 대상을 바꿀 때는 설정 모달의 값도 함께 바꾸거나 지워야 합니다.

Gemini / Anthropic / HubSpot 키는 설정 모달에서 입력하며 브라우저에만 저장됩니다.

## 문서

- `docs/supabase-migration-runbook.md` — 다른 Supabase 프로젝트로 데이터를 옮기는 절차
- `docs/supabase-legacy-migrations.sql` — 과거에 단계적으로 적용했던 증분 마이그레이션 기록 (참고용)
- `docs/superpowers/` — 기능별 설계 문서와 구현 계획

## 스크립트

- `scripts/migrate-storage.mjs` — `card-images` 버킷을 다른 프로젝트로 복사
- `scripts/rewrite-image-urls.sql` — 저장된 이미지 URL의 프로젝트 도메인 치환
- `scripts/verify-migration.sql` — 이전 전후 행 수 대조
