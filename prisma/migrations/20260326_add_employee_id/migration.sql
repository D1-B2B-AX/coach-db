-- AlterTable: coaches에 employee_id 컬럼 추가 (구글시트 동기화 키)
ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "employee_id" VARCHAR(20);
