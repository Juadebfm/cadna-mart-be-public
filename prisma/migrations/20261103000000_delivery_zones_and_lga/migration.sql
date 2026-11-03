ALTER TABLE "addresses" ADD COLUMN "lga" TEXT;

CREATE TABLE "delivery_zones" (
    "id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lgaNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_rates" (
    "id" VARCHAR(24) NOT NULL,
    "deliveryZoneId" VARCHAR(24) NOT NULL,
    "method" TEXT NOT NULL,
    "minWeightGrams" INTEGER NOT NULL DEFAULT 0,
    "maxWeightGrams" INTEGER,
    "amountKobo" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_zones_state_name_key" ON "delivery_zones"("state", "name");
CREATE INDEX "delivery_zones_state_isActive_idx" ON "delivery_zones"("state", "isActive");
CREATE UNIQUE INDEX "delivery_rates_deliveryZoneId_method_minWeightGrams_key" ON "delivery_rates"("deliveryZoneId", "method", "minWeightGrams");
CREATE INDEX "delivery_rates_deliveryZoneId_method_isActive_idx" ON "delivery_rates"("deliveryZoneId", "method", "isActive");

ALTER TABLE "delivery_rates" ADD CONSTRAINT "delivery_rates_deliveryZoneId_fkey"
FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
