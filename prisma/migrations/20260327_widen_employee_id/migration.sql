-- AlterTable: employee_id 길이 확장 (여러 사번 쉼표로 저장)
ALTER TABLE "coaches" ALTER COLUMN "employee_id" TYPE VARCHAR(200);
