CREATE TABLE "product_import_batches" (
    "id" VARCHAR(24) NOT NULL,
    "sellerId" VARCHAR(24) NOT NULL,
    "products" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_import_batches_sellerId_status_expiresAt_idx"
ON "product_import_batches"("sellerId", "status", "expiresAt");

CREATE INDEX "product_import_batches_expiresAt_idx"
ON "product_import_batches"("expiresAt");

ALTER TABLE "product_import_batches"
ADD CONSTRAINT "product_import_batches_sellerId_fkey"
FOREIGN KEY ("sellerId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
