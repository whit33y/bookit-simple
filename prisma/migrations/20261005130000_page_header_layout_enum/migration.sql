-- CreateEnum
CREATE TYPE "PageHeaderLayout" AS ENUM ('CLASSIC', 'PHOTO_SIDE', 'COMPACT');

-- AlterTable
ALTER TABLE "Salon"
  ALTER COLUMN "headerLayout" DROP DEFAULT,
  ALTER COLUMN "headerLayout" TYPE "PageHeaderLayout" USING (
    CASE "headerLayout"
      WHEN 'photo-side' THEN 'PHOTO_SIDE'
      WHEN 'compact' THEN 'COMPACT'
      ELSE 'CLASSIC'
    END
  )::"PageHeaderLayout",
  ALTER COLUMN "headerLayout" SET DEFAULT 'CLASSIC';
