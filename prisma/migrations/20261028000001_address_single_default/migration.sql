-- Keep the buyer's single-default-address rule safe during concurrent writes.
CREATE UNIQUE INDEX "addresses_one_default_per_user_idx"
ON "addresses" ("userId")
WHERE "isDefault" = true AND "deletedAt" IS NULL;
