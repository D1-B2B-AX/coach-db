-- AlterTable: 상태 메모 컬럼 추가
ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "status_note" VARCHAR(200);
