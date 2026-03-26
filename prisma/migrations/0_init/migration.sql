[dotenv@17.3.1] injecting env (16) from .env.local -- tip: ⚙️  enable debug logging with { debug: true }
Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CoachStatus" AS ENUM ('active', 'inactive', 'on_leave');

-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('admin', 'user', 'blocked');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('resume', 'portfolio', 'certificate');

-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete');

-- CreateTable
CREATE TABLE "coaches" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "birth_date" DATE,
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "affiliation" VARCHAR(100),
    "work_type" VARCHAR(200),
    "status" "CoachStatus" NOT NULL DEFAULT 'active',
    "self_note" TEXT,
    "portfolio_url" TEXT,
    "availability_detail" TEXT,
    "manager_note" TEXT,
    "access_token" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(100),

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managers" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "google_id" VARCHAR(100) NOT NULL,
    "role" "ManagerRole" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fields" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculums" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "curriculums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_fields" (
    "coach_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,

    CONSTRAINT "coach_fields_pkey" PRIMARY KEY ("coach_id","field_id")
);

-- CreateTable
CREATE TABLE "coach_curriculums" (
    "coach_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,

    CONSTRAINT "coach_curriculums_pkey" PRIMARY KEY ("coach_id","curriculum_id")
);

-- CreateTable
CREATE TABLE "coach_documents" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "file_type" "FileType" NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagements" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "course_name" VARCHAR(200) NOT NULL,
    "status" "EngagementStatus" NOT NULL DEFAULT 'scheduled',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "location" VARCHAR(200),
    "rating" SMALLINT,
    "feedback" TEXT,
    "rehire" BOOLEAN,
    "hourly_rate" INTEGER,
    "hired_by" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_schedules" (
    "id" TEXT NOT NULL,
    "engagement_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,

    CONSTRAINT "engagement_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_schedules" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_access_logs" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_edited_at" TIMESTAMP(3),

    CONSTRAINT "schedule_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "table_name" VARCHAR(50) NOT NULL,
    "record_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "field" VARCHAR(100),
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "error_detail" TEXT,
    "triggered_by" VARCHAR(100) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coaches_access_token_key" ON "coaches"("access_token");

-- CreateIndex
CREATE UNIQUE INDEX "managers_email_key" ON "managers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "managers_google_id_key" ON "managers"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "fields_name_key" ON "fields"("name");

-- CreateIndex
CREATE UNIQUE INDEX "curriculums_name_key" ON "curriculums"("name");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_access_logs_coach_id_year_month_key" ON "schedule_access_logs"("coach_id", "year_month");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_id_idx" ON "audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "audit_logs_changed_by_idx" ON "audit_logs"("changed_by");

-- AddForeignKey
ALTER TABLE "coach_fields" ADD CONSTRAINT "coach_fields_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_fields" ADD CONSTRAINT "coach_fields_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_curriculums" ADD CONSTRAINT "coach_curriculums_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_curriculums" ADD CONSTRAINT "coach_curriculums_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_documents" ADD CONSTRAINT "coach_documents_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_schedules" ADD CONSTRAINT "engagement_schedules_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_schedules" ADD CONSTRAINT "engagement_schedules_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_schedules" ADD CONSTRAINT "coach_schedules_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_access_logs" ADD CONSTRAINT "schedule_access_logs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

