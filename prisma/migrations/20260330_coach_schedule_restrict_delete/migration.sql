-- AlterForeignKey: coach_schedules.coach_id CASCADE → RESTRICT
ALTER TABLE "coach_schedules" DROP CONSTRAINT "coach_schedules_coach_id_fkey";
ALTER TABLE "coach_schedules" ADD CONSTRAINT "coach_schedules_coach_id_fkey"
  FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
