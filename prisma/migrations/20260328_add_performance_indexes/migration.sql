-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "coach_schedules_coach_id_date_idx" ON "coach_schedules"("coach_id", "date");

-- CreateIndex
CREATE INDEX "engagement_schedules_coach_id_date_idx" ON "engagement_schedules"("coach_id", "date");

-- CreateIndex
CREATE INDEX "engagement_schedules_date_idx" ON "engagement_schedules"("date");

-- CreateIndex
CREATE INDEX "engagements_coach_id_idx" ON "engagements"("coach_id");
