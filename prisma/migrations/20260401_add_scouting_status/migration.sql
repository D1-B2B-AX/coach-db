-- CreateEnum
CREATE TYPE "ScoutingStatus" AS ENUM ('scouting', 'confirmed', 'cancelled');

-- AlterTable
ALTER TABLE "scoutings" ADD COLUMN "status" "ScoutingStatus" NOT NULL DEFAULT 'scouting';
