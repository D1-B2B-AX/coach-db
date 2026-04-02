-- CreateTable
CREATE TABLE "scoutings" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoutings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scoutings_coach_id_date_idx" ON "scoutings"("coach_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "scoutings_coach_id_date_manager_id_key" ON "scoutings"("coach_id", "date", "manager_id");

-- AddForeignKey
ALTER TABLE "scoutings" ADD CONSTRAINT "scoutings_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoutings" ADD CONSTRAINT "scoutings_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
