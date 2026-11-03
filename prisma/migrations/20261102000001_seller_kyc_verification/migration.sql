ALTER TABLE "seller_profiles"
  ADD COLUMN "approvalMethod" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "kycStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "kycIdType" TEXT,
  ADD COLUMN "kycIdNumberEncrypted" TEXT,
  ADD COLUMN "kycIdNumberLast4" TEXT,
  ADD COLUMN "kycConsentAt" TIMESTAMP(3),
  ADD COLUMN "kycConsentVersion" TEXT,
  ADD COLUMN "kycProviderMode" TEXT,
  ADD COLUMN "kycVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "kycLastCheckAt" TIMESTAMP(3),
  ADD COLUMN "kycFailureCode" TEXT,
  ADD COLUMN "kycNameMatch" BOOLEAN;

CREATE TABLE "seller_kyc_checks" (
  "id" VARCHAR(24) NOT NULL,
  "sellerProfileId" VARCHAR(24) NOT NULL,
  "provider" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "checkType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "providerCode" TEXT,
  "nameMatch" BOOLEAN,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_kyc_checks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_kyc_checks_sellerProfileId_fkey"
    FOREIGN KEY ("sellerProfileId") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "seller_kyc_checks_sellerProfileId_checkedAt_idx"
  ON "seller_kyc_checks"("sellerProfileId", "checkedAt");
CREATE INDEX "seller_kyc_checks_status_checkedAt_idx"
  ON "seller_kyc_checks"("status", "checkedAt");
