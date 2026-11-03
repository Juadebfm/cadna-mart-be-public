ALTER TABLE "seller_profiles"
  ADD COLUMN "applicantType" TEXT,
  ADD COLUMN "bankCode" TEXT,
  ADD COLUMN "bankAccountNumberLast4" TEXT,
  ADD COLUMN "bankVerificationProvider" TEXT,
  ADD COLUMN "bankVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "applicationStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewReason" TEXT,
  ADD COLUMN "requestedDocumentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" VARCHAR(24);

UPDATE "seller_profiles"
SET "applicationStatus" = CASE WHEN "isApproved" THEN 'approved' ELSE 'pending' END,
    "submittedAt" = CASE WHEN "isApproved" THEN "createdAt" ELSE NULL END,
    "reviewedAt" = "approvedAt",
    "reviewedById" = "approvedById";

-- Seller access is granted only by an approved application. Preserve buyer
-- access for legacy seller-only accounts whose applications are not approved.
UPDATE "users" AS u
SET "accountTypes" = CASE
  WHEN 'buyer' = ANY(u."accountTypes") THEN array_remove(u."accountTypes", 'seller')
  ELSE ARRAY['buyer']::TEXT[]
END
WHERE 'seller' = ANY(u."accountTypes")
  AND NOT EXISTS (
    SELECT 1 FROM "seller_profiles" AS sp
    WHERE sp."userId" = u."id" AND sp."deletedAt" IS NULL AND sp."isApproved" = TRUE
  );

UPDATE "stores" AS s
SET "isActive" = FALSE
WHERE EXISTS (
  SELECT 1 FROM "seller_profiles" AS sp
  WHERE sp."userId" = s."ownerId"
    AND sp."deletedAt" IS NULL
    AND sp."isApproved" = FALSE
);

CREATE INDEX "seller_profiles_applicationStatus_submittedAt_idx"
  ON "seller_profiles"("applicationStatus", "submittedAt");

ALTER TABLE "seller_profiles"
  ADD CONSTRAINT "seller_profiles_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "seller_application_documents" (
  "id" VARCHAR(24) NOT NULL,
  "sellerProfileId" VARCHAR(24) NOT NULL,
  "uploadedById" VARCHAR(24),
  "documentType" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "seller_application_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seller_application_documents_storageKey_key"
  ON "seller_application_documents"("storageKey");
CREATE INDEX "seller_application_documents_sellerProfileId_documentType_deletedAt_idx"
  ON "seller_application_documents"("sellerProfileId", "documentType", "deletedAt");

ALTER TABLE "seller_application_documents"
  ADD CONSTRAINT "seller_application_documents_sellerProfileId_fkey"
  FOREIGN KEY ("sellerProfileId") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "seller_application_documents_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "seller_application_reviews" (
  "id" VARCHAR(24) NOT NULL,
  "sellerProfileId" VARCHAR(24) NOT NULL,
  "actorId" VARCHAR(24) NOT NULL,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT,
  "requestedDocumentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_application_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "seller_application_reviews_sellerProfileId_createdAt_idx"
  ON "seller_application_reviews"("sellerProfileId", "createdAt");

ALTER TABLE "seller_application_reviews"
  ADD CONSTRAINT "seller_application_reviews_sellerProfileId_fkey"
  FOREIGN KEY ("sellerProfileId") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "seller_application_reviews_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
