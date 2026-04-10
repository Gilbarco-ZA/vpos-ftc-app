export const customersSql = {
  selectById: `SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL`,
  selectActiveByCountryTin: `SELECT id
     FROM customers
    WHERE country = $1
      AND tin = $2
      AND deleted_at IS NULL`,
  insertNamedCustomer: `INSERT INTO customers (id, country, tin, buyer_name, is_anonymous, station_id)
    VALUES ($1, $2, $3, $4, false, $5)
    RETURNING id`,
} as const
