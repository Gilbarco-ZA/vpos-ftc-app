import { queryOne } from '@/src/platform/db/postgres'

export async function setProductActive(input: { stationId: string; productId: string; isActive: boolean }) {
  return queryOne<{ product_id: string; is_active: boolean }>(
    `UPDATE products SET is_active = $3, updated_at = CURRENT_TIMESTAMP
     WHERE station_id = $1::uuid AND product_id = $2
     RETURNING product_id, is_active`,
    [input.stationId, input.productId, input.isActive],
  )
}