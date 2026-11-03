UPDATE "products" AS p
SET "stockQty" = COALESCE(
    (
        SELECT SUM(COALESCE(NULLIF(v->>'stockQty', '')::INTEGER, 0))::INTEGER
        FROM jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(p."variants") = 'array' THEN p."variants"
                ELSE '[]'::jsonb
            END
        ) AS v
    ),
    0
);

UPDATE "products"
SET "inventoryStatus" = CASE WHEN "stockQty" > 0 THEN 'in_stock' ELSE 'out_of_stock' END;
