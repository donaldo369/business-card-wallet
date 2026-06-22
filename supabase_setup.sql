-- 1. business_cards 테이블 생성 (최초 설치용)
CREATE TABLE public.business_cards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    email TEXT,
    department TEXT,
    title TEXT,
    office_phone TEXT,
    mobile_phone TEXT,
    address TEXT,
    image_url TEXT,
    hubspot_id TEXT,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS business_cards_user_id_idx ON public.business_cards(user_id);

-- Row Level Security (RLS) 활성화
ALTER TABLE public.business_cards ENABLE ROW LEVEL SECURITY;

-- 로그인 사용자가 자신의 명함만 읽고/쓰도록 제한
CREATE POLICY "Users can read own cards" ON public.business_cards
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cards" ON public.business_cards
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cards" ON public.business_cards
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cards" ON public.business_cards
    FOR DELETE USING (auth.uid() = user_id);


-- 2. Storage 버킷 생성 및 설정
INSERT INTO storage.buckets (id, name, public) 
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS 정책 설정 (누구나 업로드 및 읽기 가능)
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'card-images');
CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'card-images');
CREATE POLICY "Public Update" ON storage.objects FOR UPDATE USING (bucket_id = 'card-images') WITH CHECK (bucket_id = 'card-images');
CREATE POLICY "Public Delete" ON storage.objects FOR DELETE USING (bucket_id = 'card-images');


-- ====================================================
-- [기존 테이블 업데이트용 쿼리]
-- 이미 테이블을 생성하신 경우, 아래 쿼리를 SQL Editor에서 실행해 주세요.
-- ====================================================
-- ALTER TABLE public.business_cards ADD COLUMN first_name TEXT;
-- ALTER TABLE public.business_cards ADD COLUMN last_name TEXT;

-- ----------------------------------------------------
-- [user_id 컬럼 추가 — Supabase Auth 도입 후 필수]
-- "Could not find the 'user_id' column of 'business_cards'" 에러가 나면
-- 아래 블록을 통째로 복사해 SQL Editor에서 실행하세요.
-- ----------------------------------------------------
-- ALTER TABLE public.business_cards
--     ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
--
-- CREATE INDEX IF NOT EXISTS business_cards_user_id_idx ON public.business_cards(user_id);
--
-- -- 기존의 익명 권한 정책 제거 (있던 경우)
-- DROP POLICY IF EXISTS "Allow public read"   ON public.business_cards;
-- DROP POLICY IF EXISTS "Allow public insert" ON public.business_cards;
-- DROP POLICY IF EXISTS "Allow public update" ON public.business_cards;
-- DROP POLICY IF EXISTS "Allow public delete" ON public.business_cards;
--
-- -- 로그인 사용자별 권한 정책
-- CREATE POLICY "Users can read own cards"   ON public.business_cards
--     FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can insert own cards" ON public.business_cards
--     FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can update own cards" ON public.business_cards
--     FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can delete own cards" ON public.business_cards
--     FOR DELETE USING (auth.uid() = user_id);
--
-- -- 스키마 캐시 즉시 갱신 (PostgREST에게 알림)
-- NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------
-- [명함 히스토리 컬럼 추가 — 동일인 1행 + history 누적 모델 도입]
-- 같은 사람(이름 + 핸드폰 번호)이 여러 행으로 흩어져 있던 것을
-- "현재 정보 1행 + 과거 스캔 N개를 JSONB로 누적" 형태로 통합합니다.
-- 아래 블록을 순서대로 실행하세요.
-- ----------------------------------------------------
--
-- -- 1) history / updated_at 컬럼 추가
-- ALTER TABLE public.business_cards
--     ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb,
--     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
--
-- UPDATE public.business_cards SET updated_at = created_at WHERE updated_at IS NULL;
--
-- -- 2) 기존 중복 행 통합 (가장 최신 행을 keeper로 남기고, 이전 행들은 history에 담아 삭제)
-- CREATE TEMP TABLE consolidation AS
-- SELECT
--   bc.*,
--   REGEXP_REPLACE(COALESCE(bc.mobile_phone, ''), '[[:space:]-]', '', 'g') AS phone_norm,
--   ROW_NUMBER() OVER (
--     PARTITION BY bc.user_id, bc.name,
--                  REGEXP_REPLACE(COALESCE(bc.mobile_phone, ''), '[[:space:]-]', '', 'g')
--     ORDER BY bc.created_at DESC
--   ) AS rn,
--   FIRST_VALUE(bc.id) OVER (
--     PARTITION BY bc.user_id, bc.name,
--                  REGEXP_REPLACE(COALESCE(bc.mobile_phone, ''), '[[:space:]-]', '', 'g')
--     ORDER BY bc.created_at DESC
--   ) AS keeper_id
-- FROM public.business_cards bc
-- WHERE bc.name IS NOT NULL
--   AND bc.mobile_phone IS NOT NULL
--   AND bc.mobile_phone <> '';
--
-- WITH history_to_add AS (
--   SELECT
--     keeper_id,
--     JSONB_AGG(
--       JSONB_BUILD_OBJECT(
--         'image_url', image_url,
--         'company', company,
--         'title', title,
--         'department', department,
--         'email', email,
--         'office_phone', office_phone,
--         'mobile_phone', mobile_phone,
--         'address', address,
--         'recorded_at', created_at
--       )
--       ORDER BY created_at DESC
--     ) AS history_data
--   FROM consolidation
--   WHERE rn > 1
--   GROUP BY keeper_id
-- )
-- UPDATE public.business_cards bc
-- SET history = COALESCE(bc.history, '[]'::jsonb) || hta.history_data
-- FROM history_to_add hta
-- WHERE bc.id = hta.keeper_id;
--
-- DELETE FROM public.business_cards
-- WHERE id IN (SELECT id FROM consolidation WHERE rn > 1);
--
-- DROP TABLE consolidation;
--
-- NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------
-- [name 컬럼 정규화 — last_name + first_name 재조합]
-- 명함에 자간을 띄워 인쇄된 이름("복 세 현")이 name 필드에 그대로
-- 저장된 경우를 정리합니다. 한글 이름은 붙여쓰기, 그 외(영문 등)는
-- "first last" 순으로 띄어쓰기로 재조합합니다.
-- ----------------------------------------------------

-- 1) last_name / first_name 내부 공백 제거
UPDATE public.business_cards
SET
  last_name = NULLIF(REGEXP_REPLACE(last_name, '\s+', '', 'g'), ''),
  first_name = NULLIF(REGEXP_REPLACE(first_name, '\s+', '', 'g'), '')
WHERE last_name ~ '\s' OR first_name ~ '\s';

-- 2) name을 last_name + first_name으로 재조합
UPDATE public.business_cards
SET name = CASE
  WHEN last_name ~ '[가-힣]' OR first_name ~ '[가-힣]'
    THEN COALESCE(last_name, '') || COALESCE(first_name, '')
  ELSE TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
END
WHERE last_name IS NOT NULL OR first_name IS NOT NULL;

-- 3) last_name/first_name이 모두 없는 경우, name 내 연속 공백만 정리
UPDATE public.business_cards
SET name = TRIM(BOTH FROM REGEXP_REPLACE(name, '\s+', ' ', 'g'))
WHERE last_name IS NULL AND first_name IS NULL AND name ~ '\s';

NOTIFY pgrst, 'reload schema';
