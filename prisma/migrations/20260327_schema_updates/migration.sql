-- AlterEnum: CoachStatus에 pending 추가
ALTER TYPE "CoachStatus" ADD VALUE IF NOT EXISTS 'pending';

-- AlterTable: coaches
ALTER TABLE "coaches" DROP COLUMN IF EXISTS "hourly_rate";
ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "status_note" VARCHAR(200);
ALTER TABLE "coaches" ALTER COLUMN "employee_id" SET DATA TYPE VARCHAR(200);

-- AlterTable: engagements
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "work_type" VARCHAR(200);
