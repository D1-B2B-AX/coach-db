-- AlterEnum: CoachStatus에서 on_leave 제거
BEGIN;
CREATE TYPE "CoachStatus_new" AS ENUM ('pending', 'active', 'inactive');
ALTER TABLE "public"."coaches" ALTER COLUMN "status" DROP DEFAULT;
UPDATE "coaches" SET "status" = 'inactive' WHERE "status" = 'on_leave';
ALTER TABLE "coaches" ALTER COLUMN "status" TYPE "CoachStatus_new" USING ("status"::text::"CoachStatus_new");
ALTER TYPE "CoachStatus" RENAME TO "CoachStatus_old";
ALTER TYPE "CoachStatus_new" RENAME TO "CoachStatus";
DROP TYPE "public"."CoachStatus_old";
ALTER TABLE "coaches" ALTER COLUMN "status" SET DEFAULT 'active';
COMMIT;

-- AlterTable: coaches에 return_date 추가
ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "return_date" DATE;
