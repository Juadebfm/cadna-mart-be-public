ALTER TABLE "orders" ADD COLUMN "paidAt" TIMESTAMP(3);

UPDATE "orders" AS order_row
SET "paidAt" = (
  SELECT (entry ->> 'timestamp')::TIMESTAMP(3)
  FROM jsonb_array_elements(COALESCE(order_row."timeline", '[]'::jsonb)) AS events(entry)
  WHERE entry ->> 'note' = 'Payment confirmed'
  ORDER BY (entry ->> 'timestamp')::TIMESTAMP(3) DESC
  LIMIT 1
)
WHERE order_row."paymentStatus" = 'paid'
  AND order_row."paidAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(order_row."timeline", '[]'::jsonb)) AS events(entry)
    WHERE entry ->> 'note' = 'Payment confirmed'
  );

CREATE INDEX "orders_paymentStatus_paidAt_idx" ON "orders"("paymentStatus", "paidAt");
