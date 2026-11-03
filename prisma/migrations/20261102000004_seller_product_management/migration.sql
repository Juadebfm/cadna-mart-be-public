-- Add seller product lifecycle, courier pickup confirmation, and delivery metadata.
ALTER TABLE "stores"
ADD COLUMN "pickupAddress" JSONB,
ADD COLUMN "pickupAddressConfirmedAt" TIMESTAMP(3);

ALTER TABLE "products"
ADD COLUMN "deliveryMethod" TEXT,
ADD COLUMN "isDeactivated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publicationStatus" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN "recommendedAt" TIMESTAMP(3),
ADD COLUMN "salesClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shippingWeightGrams" INTEGER;

-- Preserve the public state of any existing active listings as Live.
UPDATE "products"
SET "publicationStatus" = 'live'
WHERE "isActive" = true AND "deletedAt" IS NULL;

CREATE INDEX "products_sellerId_publicationStatus_isDeactivated_deletedAt_idx"
ON "products"("sellerId", "publicationStatus", "isDeactivated", "deletedAt");

CREATE INDEX "products_sellerId_recommendedAt_idx"
ON "products"("sellerId", "recommendedAt");
