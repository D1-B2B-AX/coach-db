-- CreateTable
CREATE TABLE "api_access_logs" (
    "id" TEXT NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_name" VARCHAR(50) NOT NULL,
    "user_agent" TEXT,
    "ip" VARCHAR(50),
    "status_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_access_logs_actor_type_actor_id_idx" ON "api_access_logs"("actor_type", "actor_id");

-- CreateIndex
CREATE INDEX "api_access_logs_created_at_idx" ON "api_access_logs"("created_at");
