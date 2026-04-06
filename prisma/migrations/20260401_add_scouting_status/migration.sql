-- CreateEnum
CREATE TYPE "ScoutingStatus" AS ENUM ('scouting', 'confirmed', 'cancelled');

-- AlterTable
ALTER TABLE "scoutings" ADD COLUMN "status" "ScoutingStatus" NOT NULL DEFAULT 'scouting';

-- AlterEnum (moved from add_notifications for correct shadow DB ordering)
ALTER TYPE "ScoutingStatus" ADD VALUE 'accepted';
ALTER TYPE "ScoutingStatus" ADD VALUE 'rejected';
