ALTER TABLE transaction_lines
  ADD COLUMN IF NOT EXISTS tax_code TEXT,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6, 4);

UPDATE transaction_lines tl
   SET tax_code = COALESCE(tl.tax_code, p.ext_tax_code, p.tax_code),
       tax_rate = COALESCE(tl.tax_rate, p.tax_rate)
  FROM products p
 WHERE p.id = tl.product_id
   AND (tl.tax_code IS NULL OR tl.tax_rate IS NULL);

