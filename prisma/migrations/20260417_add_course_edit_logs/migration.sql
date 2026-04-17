-- CreateTable
CREATE TABLE "course_edit_logs" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "edited_by" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB NOT NULL,

    CONSTRAINT "course_edit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_edit_logs_course_id_edited_at_idx" ON "course_edit_logs"("course_id", "edited_at");

-- AddForeignKey
ALTER TABLE "course_edit_logs" ADD CONSTRAINT "course_edit_logs_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_edit_logs" ADD CONSTRAINT "course_edit_logs_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
