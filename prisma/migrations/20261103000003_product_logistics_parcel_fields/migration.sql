ALTER TABLE "products"
  ADD COLUMN "logisticsCategoryId" INTEGER,
  ADD COLUMN "packageLengthCm" DOUBLE PRECISION,
  ADD COLUMN "packageWidthCm" DOUBLE PRECISION,
  ADD COLUMN "packageHeightCm" DOUBLE PRECISION;

ALTER TABLE "logistics_bookings"
  ADD COLUMN "groupKey" TEXT,
  ADD COLUMN "quoteId" TEXT,
  ADD COLUMN "courierId" TEXT,
  ADD COLUMN "serviceCode" TEXT,
  ADD COLUMN "shipmentReference" TEXT,
  ADD COLUMN "bookingUncertain" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX "logistics_bookings_orderId_groupKey_key"
  ON "logistics_bookings"("orderId", "groupKey");
