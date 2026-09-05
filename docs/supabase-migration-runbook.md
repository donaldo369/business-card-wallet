# Supabase 전용 프로젝트 분리 이전 런북

공유 프로젝트(Privacy)에서 명함앱만 떼어내 **새 전용 Supabase 프로젝트**로 옮기는 절차입니다.
계정(UUID·비밀번호), 명함/그룹 데이터, 스토리지 이미지를 모두 보존합니다.

**원본은 건드리지 않습니다.** 모든 작업은 옛 프로젝트에서 읽기만 하고 새 프로젝트에 씁니다.
문제가 생기면 Vercel 환경변수만 되돌리면 즉시 복구됩니다.

---

## 0. 사전 준비

### 0-1. 새 프로젝트 생성
https://database.new 에서 새 프로젝트를 만듭니다. 리전은 옛 프로젝트와 같게 두는 편이 좋습니다.

### 0-2. 필요한 값 6개 수집

| 값 | 위치 |
|---|---|
| `OLD_DB_URL` | 옛 프로젝트 → Connect → **Session pooler** 연결 문자열 |
| `NEW_DB_URL` | 새 프로젝트 → Connect → **Session pooler** 연결 문자열 |
| `OLD_SERVICE_ROLE_KEY` | 옛 프로젝트 → Project Settings → API keys → `service_role` |
| `NEW_SERVICE_ROLE_KEY` | 새 프로젝트 → 동일 |
| `NEW_SUPABASE_URL` | 새 프로젝트 → Project Settings → API → Project URL |
| `NEW_ANON_KEY` | 새 프로젝트 → Project Settings → API keys → `anon` / `publishable` |

### 0-3. 로컬에 자격증명 파일 작성

셸 히스토리에 키가 남지 않도록 파일에 모아 둡니다.
`.env*` 는 `.gitignore`에 걸려 있어 커밋되지 않습니다.

```bash
cat > .env.migration <<'EOF'
OLD_DB_URL='postgresql://postgres.xxxxxxxx:PASSWORD@aws-0-...pooler.supabase.com:5432/postgres'
NEW_DB_URL='postgresql://postgres.yyyyyyyy:PASSWORD@aws-0-...pooler.supabase.com:5432/postgres'
OLD_SUPABASE_URL='https://xxxxxxxx.supabase.co'
NEW_SUPABASE_URL='https://yyyyyyyy.supabase.co'
OLD_SERVICE_ROLE_KEY='...'
NEW_SERVICE_ROLE_KEY='...'
OLD_HOST='xxxxxxxx.supabase.co'
NEW_HOST='yyyyyyyy.supabase.co'
EOF
chmod 600 .env.migration
```

### 0-4. 셸 준비 (매 터미널마다)

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"   # psql / pg_dump (brew install libpq)
set -a && source .env.migration && set +a
psql "$OLD_DB_URL" -c 'select 1' && psql "$NEW_DB_URL" -c 'select 1'   # 연결 확인
```

---

## 1. 새 프로젝트에 스키마 생성

새 프로젝트 SQL Editor에 `supabase_setup.sql` 전체를 붙여넣고 실행합니다. (또는)

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase_setup.sql
```

테이블 3개 + RLS 정책 + `card-images` 버킷이 만들어집니다.

### 이전 전 현황 기록 (나중에 대조할 기준값)

```bash
psql "$OLD_DB_URL" -f scripts/verify-migration.sql | tee /tmp/before-old.txt
```

---

## 2. 계정 이전 (auth.users / auth.identities)

UUID와 비밀번호 해시를 그대로 옮기므로 **기존 이메일·비밀번호로 그대로 로그인**됩니다.
데이터의 `user_id` FK도 그대로 유효해집니다.

```bash
pg_dump "$OLD_DB_URL" \
  --data-only --no-owner --no-privileges --column-inserts \
  -t auth.users -t auth.identities \
  -f /tmp/auth_data.sql

grep -c INSERT /tmp/auth_data.sql   # 사용자 수 확인
```

`--column-inserts`를 쓰는 이유: 두 프로젝트의 GoTrue 버전이 달라 `auth` 테이블 컬럼이 어긋나도
컬럼명을 명시해 넣으므로 깨지지 않습니다.

```bash
psql "$NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' \
  --file /tmp/auth_data.sql
```

**문제 대응**
- `column "provider_id" ... does not exist` → 옛 프로젝트가 구버전입니다. 아래로 보완하세요.
  ```bash
  psql "$NEW_DB_URL" -c "UPDATE auth.identities SET provider_id = user_id::text WHERE provider_id IS NULL;"
  ```
- 중복 키 오류 → 새 프로젝트에서 이미 계정을 만들어 둔 경우입니다. 그 계정을 대시보드에서 지우고 다시 실행하세요.

---

## 3. 명함 데이터 이전

```bash
pg_dump "$OLD_DB_URL" \
  --data-only --no-owner --no-privileges \
  -t public.business_cards -t public.card_groups -t public.card_group_members \
  -f /tmp/app_data.sql

psql "$NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' \
  --file /tmp/app_data.sql
```

`session_replication_role = replica`로 FK 트리거를 잠시 꺼서 테이블 주입 순서에 상관없이 들어갑니다.
이 설정은 세션 한정이라 이후 동작에 영향을 주지 않습니다.

---

## 4. 스토리지 이미지 복사

```bash
DRY_RUN=1 node scripts/migrate-storage.mjs   # 먼저 파일 개수만 확인
node scripts/migrate-storage.mjs             # 실제 복사
```

실패한 파일이 있으면 그대로 다시 실행하면 됩니다(`upsert: true`라 중복 업로드가 안전합니다).

---

## 5. 이미지 URL 재작성

`image_url`, `back_image_url`, 그리고 `history` JSONB 안의 URL까지 새 도메인으로 바꿉니다.

```bash
psql "$NEW_DB_URL" \
  -v old_host="$OLD_HOST" \
  -v new_host="$NEW_HOST" \
  -f scripts/rewrite-image-urls.sql
```

마지막에 출력되는 "미치환" 3개 숫자가 **모두 0** 이어야 합니다.

---

## 6. 검증

```bash
psql "$NEW_DB_URL" -f scripts/verify-migration.sql | tee /tmp/after-new.txt
diff /tmp/before-old.txt /tmp/after-new.txt
```

- 행 수가 옛 프로젝트와 같아야 합니다 (`auth.users` 수는 다를 수 있음 — 다른 앱 계정 제외 시).
- "고아 명함"은 **0** 이어야 합니다.

---

## 7. 앱 접속 설정 교체

### 7-1. Vercel 환경변수

Vercel → 프로젝트 → Settings → Environment Variables에서 Production/Preview/Development 모두 교체:

| 이름 | 새 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `NEW_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEW_ANON_KEY` |

교체 후 **재배포**해야 반영됩니다 (`NEXT_PUBLIC_*`는 빌드 시점에 번들에 박힙니다).

### 7-2. ⚠️ 브라우저에 저장된 설정 지우기 — 빼먹으면 안 됩니다

`src/app/page.js:182` 기준으로 **localStorage 설정이 환경변수보다 우선**합니다.
지금까지 앱 안 설정 모달에 URL/키를 직접 입력해 썼다면, 재배포해도 그 브라우저는 계속 옛 프로젝트를 봅니다.

앱을 쓰는 **모든 기기·브라우저**에서 둘 중 하나를 하세요.

- 설정 모달을 열어 Supabase URL / anon key를 새 값으로 바꿔 저장, 또는
- 개발자 도구 콘솔에서 지워 환경변수를 쓰게 하기:
  ```js
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_anon_key');
  location.reload();
  ```

### 7-3. 로컬 개발

```bash
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=$NEW_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=<NEW_ANON_KEY>
EOF
```

---

## 8. 최종 동작 확인

1. 기존 이메일/비밀번호로 **로그인**
2. 명함 목록 개수가 이전과 같은지
3. 명함 **이미지가 보이는지** (앞면/뒷면, 이력 이미지 포함)
4. **새 명함 스캔 → 저장** (새 버킷에 업로드되는지)
5. **그룹** 생성/지정/해제

---

## 9. 마무리

- 확인이 끝날 때까지 Privacy 프로젝트의 명함 테이블·이미지는 **지우지 마세요**. 롤백 수단입니다.
- 며칠 운영해 이상이 없으면 옛 프로젝트에서 정리:
  ```sql
  DROP TABLE public.card_group_members, public.card_groups, public.business_cards;
  -- card-images 버킷은 대시보드에서 비우고 삭제
  ```
- 로컬 자격증명 정리: `rm .env.migration /tmp/auth_data.sql /tmp/app_data.sql`
- 이전이 끝나면 `scripts/migrate-storage.mjs`, `scripts/rewrite-image-urls.sql`은 역할을 다합니다.
  기록으로 남기든 지우든 무방합니다.

## 롤백

Vercel 환경변수를 옛 값으로 되돌리고 재배포합니다.
localStorage를 새 값으로 바꿔 둔 브라우저는 7-2 방법으로 옛 값으로 되돌립니다.
