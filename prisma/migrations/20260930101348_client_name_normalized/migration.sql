-- AlterTable: fill existing rows like `normalizeName` from libs/shared, then require it.
-- Only Polish letters lose their marks here; the api rewrites the column on the next save.
ALTER TABLE "Client" ADD COLUMN     "nameNormalized" TEXT;

UPDATE "Client"
SET "nameNormalized" = trim(regexp_replace(
  translate(lower("name"), 'ąćęłńóśźż', 'acelnoszz'),
  '\s+', ' ', 'g'
));

ALTER TABLE "Client" ALTER COLUMN "nameNormalized" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Client_salonId_nameNormalized_idx" ON "Client"("salonId", "nameNormalized");
