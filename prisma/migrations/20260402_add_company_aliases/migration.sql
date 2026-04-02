-- CreateTable
CREATE TABLE IF NOT EXISTS "company_aliases" (
    "id" TEXT NOT NULL,
    "company_name" VARCHAR(100) NOT NULL,
    "alias" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "company_aliases_company_name_key" ON "company_aliases"("company_name");
