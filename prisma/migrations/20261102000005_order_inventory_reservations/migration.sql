ALTER TABLE "orders"
ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "products"
ADD COLUMN "stockQty" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "inventory_reservations" (
    "id" VARCHAR(24) NOT NULL,
    "orderId" VARCHAR(24) NOT NULL,
    "productId" VARCHAR(24) NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_reservations_orderId_status_idx"
ON "inventory_reservations"("orderId", "status");

CREATE INDEX "inventory_reservations_status_expiresAt_idx"
ON "inventory_reservations"("status", "expiresAt");

CREATE INDEX "inventory_reservations_productId_variantId_status_idx"
ON "inventory_reservations"("productId", "variantId", "status");

ALTER TABLE "inventory_reservations"
ADD CONSTRAINT "inventory_reservations_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_reservations"
ADD CONSTRAINT "inventory_reservations_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
