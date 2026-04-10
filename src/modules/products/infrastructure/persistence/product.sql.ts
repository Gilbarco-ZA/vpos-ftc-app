export const LIST_PRODUCTS_SQL = `SELECT p.id, p.product_id, p.product_code, p.product_name, p.sku, p.unit_price, p.currency,
        p.last_sync_status, p.last_sync_at,
        COALESCE(pc.name, p.category) AS category_name
   FROM products p
   LEFT JOIN product_categories pc
     ON pc.id = p.category_id
    AND pc.station_id = p.station_id
  WHERE p.station_id = $1
  ORDER BY p.updated_at DESC`

export const GET_PRODUCT_BY_ID_SQL = `SELECT p.*,
        COALESCE(pc.name, p.category) AS category_name,
        pc.icon AS category_icon,
        pc.image_path AS category_image_path
   FROM products p
   LEFT JOIN product_categories pc
     ON pc.id = p.category_id
    AND pc.station_id = p.station_id
  WHERE p.station_id = $1 AND p.product_id = $2`

export const UPSERT_PRODUCT_SQL = `INSERT INTO products (
    id, station_id, product_id, product_code, product_name, product_class_code,
    product_type_code, sku, barcode, unit_price, unit_cost, currency,
    tax_rate, category_id, category, unit_of_measure, unit_of_packaging, ext_product_id, ext_product_code, ext_product_class_code,
    ext_product_type_code, ext_description, ext_unit_of_measure,
    ext_unit_of_packaging, ext_unit_price, ext_currency, ext_tax_code,
    ext_hazardous_indicator, pack_size, tax_code,
    commodity_code, hazardous_indicator, created_by_name, is_online,
    dev_flow_override, last_sync_status, last_sync_at, last_sync_message
  ) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, $15, $16,
    $17, $18, $19, $20, $21,
    $22, $23, $24, $25, $26,
    $27, $28, $29, $30, $31,
    $32, $33, $34, $35, $36,
    $37, $38
  ) ON CONFLICT (station_id, product_id) DO UPDATE SET
    product_code = EXCLUDED.product_code,
    product_name = EXCLUDED.product_name,
    product_class_code = EXCLUDED.product_class_code,
    product_type_code = EXCLUDED.product_type_code,
    sku = EXCLUDED.sku,
    barcode = EXCLUDED.barcode,
    unit_price = EXCLUDED.unit_price,
    unit_cost = EXCLUDED.unit_cost,
    currency = EXCLUDED.currency,
    tax_rate = EXCLUDED.tax_rate,
    category_id = EXCLUDED.category_id,
    category = EXCLUDED.category,
    unit_of_measure = EXCLUDED.unit_of_measure,
    unit_of_packaging = EXCLUDED.unit_of_packaging,
    ext_product_id = EXCLUDED.ext_product_id,
    ext_product_code = EXCLUDED.ext_product_code,
    ext_product_class_code = EXCLUDED.ext_product_class_code,
    ext_product_type_code = EXCLUDED.ext_product_type_code,
    ext_description = EXCLUDED.ext_description,
    ext_unit_of_measure = EXCLUDED.ext_unit_of_measure,
    ext_unit_of_packaging = EXCLUDED.ext_unit_of_packaging,
    ext_unit_price = EXCLUDED.ext_unit_price,
    ext_currency = EXCLUDED.ext_currency,
    ext_tax_code = EXCLUDED.ext_tax_code,
    ext_hazardous_indicator = EXCLUDED.ext_hazardous_indicator,
    pack_size = EXCLUDED.pack_size,
    tax_code = EXCLUDED.tax_code,
    commodity_code = EXCLUDED.commodity_code,
    hazardous_indicator = EXCLUDED.hazardous_indicator,
    created_by_name = EXCLUDED.created_by_name,
    is_online = EXCLUDED.is_online,
    dev_flow_override = EXCLUDED.dev_flow_override,
    updated_at = CURRENT_TIMESTAMP
  RETURNING *`

export const UPDATE_PRODUCT_SYNC_STATUS_SQL = `UPDATE products
   SET last_sync_status = $3,
       last_sync_at = CURRENT_TIMESTAMP,
       last_sync_message = $4,
       updated_at = CURRENT_TIMESTAMP
 WHERE station_id = $1 AND product_id = $2`
