-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "manager_id" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_manager_id_idx" ON "courses"("manager_id");

-- AddColumn
ALTER TABLE "scoutings" ADD COLUMN "course_id" TEXT;

-- CreateIndex
CREATE INDEX "scoutings_course_id_idx" ON "scoutings"("course_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoutings" ADD CONSTRAINT "scoutings_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
