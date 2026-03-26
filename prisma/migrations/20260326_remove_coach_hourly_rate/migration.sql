-- AlterTable: coaches 테이블에서 hourly_rate 컬럼 제거 (급여는 engagement별로 관리)
ALTER TABLE "coaches" DROP COLUMN IF EXISTS "hourly_rate";
