-- ============================================================
-- 이전 결과 검증 — 옛 프로젝트와 새 프로젝트에서 각각 실행해 숫자를 비교합니다.
--   psql "$OLD_DB_URL" -f scripts/verify-migration.sql
--   psql "$NEW_DB_URL" -f scripts/verify-migration.sql
-- ============================================================

SELECT 'auth.users'             AS "테이블", COUNT(*) AS "행 수" FROM auth.users
UNION ALL
SELECT 'auth.identities',       COUNT(*) FROM auth.identities
UNION ALL
SELECT 'business_cards',        COUNT(*) FROM public.business_cards
UNION ALL
SELECT 'card_groups',           COUNT(*) FROM public.card_groups
UNION ALL
SELECT 'card_group_members',    COUNT(*) FROM public.card_group_members
UNION ALL
SELECT 'storage.objects (card-images)', COUNT(*) FROM storage.objects WHERE bucket_id = 'card-images';

-- 사용자별 명함 수 (user_id가 그대로 보존됐는지 대조용)
SELECT u.id AS "user_id", u.email, COUNT(bc.id) AS "명함 수"
FROM auth.users u
LEFT JOIN public.business_cards bc ON bc.user_id = u.id
GROUP BY u.id, u.email
ORDER BY u.email;

-- 소유자가 없는 명함(FK 유실) — 0 이어야 정상
SELECT COUNT(*) AS "고아 명함"
FROM public.business_cards bc
WHERE bc.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bc.user_id);
