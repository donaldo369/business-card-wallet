-- 1. business_cards 테이블 생성 (최초 설치용)
CREATE TABLE public.business_cards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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

-- Row Level Security (RLS) 활성화
ALTER TABLE public.business_cards ENABLE ROW LEVEL SECURITY;

-- 익명 사용자(anon)를 위한 모든 권한 허용 정책 생성 (간단한 로컬/개인 유틸앱 용도)
CREATE POLICY "Allow public read" ON public.business_cards FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.business_cards FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.business_cards FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.business_cards FOR DELETE USING (true);


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
-- 이미 테이블을 생성하신 경우, 아래 두 줄만 복사하여 SQL Editor에서 실행해 주세요.
-- ====================================================
-- ALTER TABLE public.business_cards ADD COLUMN first_name TEXT;
-- ALTER TABLE public.business_cards ADD COLUMN last_name TEXT;
