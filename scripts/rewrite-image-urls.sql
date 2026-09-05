-- ============================================================
-- 이미지 URL 재작성 — 새 Supabase 프로젝트에서 실행
-- ============================================================
-- 명함 데이터에는 옛 프로젝트 도메인의 public URL이 그대로 저장돼 있습니다.
-- 스토리지 파일 복사(scripts/migrate-storage.mjs)를 마친 뒤 실행하세요.
--
--   psql "$NEW_DB_URL" \
--     -v old_host=xxxxxxxx.supabase.co \
--     -v new_host=yyyyyyyy.supabase.co \
--     -f scripts/rewrite-image-urls.sql
--
-- old_host / new_host 는 프로젝트 ref 부분만 다른 도메인입니다.
-- (예: https://abcdefgh.supabase.co → abcdefgh.supabase.co)
-- ============================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1) 앞면 이미지
UPDATE public.business_cards
SET image_url = REPLACE(image_url, :'old_host', :'new_host')
WHERE image_url LIKE '%' || :'old_host' || '%';

-- 2) 뒷면 이미지
UPDATE public.business_cards
SET back_image_url = REPLACE(back_image_url, :'old_host', :'new_host')
WHERE back_image_url LIKE '%' || :'old_host' || '%';

-- 3) history JSONB 내부의 image_url / back_image_url
--    (배열 전체를 텍스트로 치환 — 키 구조에 상관없이 안전)
UPDATE public.business_cards
SET history = REPLACE(history::text, :'old_host', :'new_host')::jsonb
WHERE history::text LIKE '%' || :'old_host' || '%';

COMMIT;

-- 4) 남은 옛 도메인 참조 확인 — 모두 0 이어야 정상
SELECT
  COUNT(*) FILTER (WHERE image_url      LIKE '%' || :'old_host' || '%') AS "앞면 미치환",
  COUNT(*) FILTER (WHERE back_image_url LIKE '%' || :'old_host' || '%') AS "뒷면 미치환",
  COUNT(*) FILTER (WHERE history::text  LIKE '%' || :'old_host' || '%') AS "history 미치환"
FROM public.business_cards;
