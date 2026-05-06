-- CreateTable
CREATE TABLE "dx_assignments" (
    "id" TEXT NOT NULL,
    "track_name" VARCHAR(100) NOT NULL,
    "date" DATE NOT NULL,
    "coach_id" TEXT NOT NULL,
    "assigned_by" VARCHAR(100) NOT NULL,
    "is_auto" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dx_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dx_assignments_track_name_date_coach_id_key" ON "dx_assignments"("track_name", "date", "coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "dx_assignments_date_coach_id_key" ON "dx_assignments"("date", "coach_id");

-- CreateIndex
CREATE INDEX "dx_assignments_date_idx" ON "dx_assignments"("date");

-- AddForeignKey
ALTER TABLE "dx_assignments" ADD CONSTRAINT "dx_assignments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
