ALTER TABLE "users"
  ADD COLUMN "accountTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "users"
SET "accountTypes" = ARRAY["accountType"]::TEXT[]
WHERE cardinality("accountTypes") = 0;
