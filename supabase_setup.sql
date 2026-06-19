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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
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
