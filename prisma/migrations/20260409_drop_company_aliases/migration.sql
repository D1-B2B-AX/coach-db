-- 익명화 기능 제거: company_aliases 테이블 drop
-- 프로덕션/로컬 모두 0 rows 확인 후 drop
DROP TABLE IF EXISTS "company_aliases";
