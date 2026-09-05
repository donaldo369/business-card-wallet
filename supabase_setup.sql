-- ============================================================
-- 명함 지갑 — 신규 Supabase 프로젝트 설치 스크립트
-- ============================================================
-- 새로 만든 Supabase 프로젝트의 SQL Editor에서 이 파일 전체를 한 번 실행하세요.
-- 여러 번 실행해도 안전합니다(idempotent).
--
-- 과거 프로젝트에 단계적으로 적용했던 증분 마이그레이션 조각들은
-- docs/supabase-legacy-migrations.sql 에 참고용으로 보관되어 있습니다.
-- 신규 설치에는 이 파일 하나면 충분합니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1. business_cards — 명함 1건 = 1행 (과거 스캔 이력은 history JSONB에 누적)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_cards (
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
    back_image_url TEXT,
    hubspot_id TEXT,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS business_cards_user_id_idx ON public.business_cards(user_id);

ALTER TABLE public.business_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own cards"   ON public.business_cards;
DROP POLICY IF EXISTS "Users can insert own cards" ON public.business_cards;
DROP POLICY IF EXISTS "Users can update own cards" ON public.business_cards;
DROP POLICY IF EXISTS "Users can delete own cards" ON public.business_cards;

CREATE POLICY "Users can read own cards" ON public.business_cards
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cards" ON public.business_cards
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cards" ON public.business_cards
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cards" ON public.business_cards
    FOR DELETE USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 2. card_groups — 사용자별 그룹(태그) 정의
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.card_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS card_groups_user_id_idx ON public.card_groups(user_id);

ALTER TABLE public.card_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own groups"   ON public.card_groups;
DROP POLICY IF EXISTS "Users can insert own groups" ON public.card_groups;
DROP POLICY IF EXISTS "Users can update own groups" ON public.card_groups;
DROP POLICY IF EXISTS "Users can delete own groups" ON public.card_groups;

CREATE POLICY "Users can read own groups" ON public.card_groups
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own groups" ON public.card_groups
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own groups" ON public.card_groups
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own groups" ON public.card_groups
    FOR DELETE USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 3. card_group_members — 명함 ↔ 그룹 N:N 매핑
--    (앱은 추가/삭제만 하므로 UPDATE 정책은 두지 않습니다)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.card_group_members (
    card_id UUID REFERENCES public.business_cards(id) ON DELETE CASCADE NOT NULL,
    group_id UUID REFERENCES public.card_groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (card_id, group_id)
);

CREATE INDEX IF NOT EXISTS card_group_members_user_id_idx  ON public.card_group_members(user_id);
CREATE INDEX IF NOT EXISTS card_group_members_group_id_idx ON public.card_group_members(group_id);

ALTER TABLE public.card_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own group members"   ON public.card_group_members;
DROP POLICY IF EXISTS "Users can insert own group members" ON public.card_group_members;
DROP POLICY IF EXISTS "Users can delete own group members" ON public.card_group_members;

CREATE POLICY "Users can read own group members" ON public.card_group_members
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own group members" ON public.card_group_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own group members" ON public.card_group_members
    FOR DELETE USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 4. Storage — card-images 버킷
--    읽기는 공개(명함 이미지를 <img>로 표시해야 함),
--    쓰기는 로그인 사용자로 제한.
--    anon 키는 NEXT_PUBLIC_ 으로 브라우저에 노출되므로
--    쓰기까지 공개하면 누구나 버킷에 업로드/삭제할 수 있습니다.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access"          ON storage.objects;
DROP POLICY IF EXISTS "Public Upload"          ON storage.objects;
DROP POLICY IF EXISTS "Public Update"          ON storage.objects;
DROP POLICY IF EXISTS "Public Delete"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete"   ON storage.objects;

-- 읽기: 누구나 (public 버킷이므로 CDN URL로 바로 접근)
CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'card-images');

-- 쓰기: 로그인 사용자만
CREATE POLICY "Authenticated Upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'card-images');
CREATE POLICY "Authenticated Update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'card-images') WITH CHECK (bucket_id = 'card-images');
CREATE POLICY "Authenticated Delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'card-images');


-- PostgREST 스키마 캐시 즉시 갱신
NOTIFY pgrst, 'reload schema';
