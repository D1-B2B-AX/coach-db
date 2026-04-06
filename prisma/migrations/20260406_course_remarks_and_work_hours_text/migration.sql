-- AlterColumn: work_hours VARCHAR(100) -> TEXT
ALTER TABLE "courses" ALTER COLUMN "work_hours" SET DATA TYPE TEXT;

-- AddColumn: remarks (IF NOT EXISTS - may already exist from direct apply)
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
