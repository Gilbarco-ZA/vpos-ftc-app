import type { PssXmlIdMap } from '@/src/shared/integrations/pssXml/types'

import { queryOne } from '@/src/platform/db/postgres'
import { PSS_XML_KEYS } from '@/src/shared/integrations/pssXml/keys'
import { kvGet } from '@/src/shared/storage/stationKv'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

const mappedPssProductIds = (idMap: PssXmlIdMap | null) =>
  Array.from(
    new Set(
      Object.values(idMap?.productDbIdByGradeId ?? {})
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  )

export async function getSetupForecourtCounts(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')

  const [products, pumps, tanks, nozzles, idMap] = await Promise.all([
    queryOne<{ count: string }>(
      'SELECT COUNT(1)::text AS count FROM products WHERE station_id = $1',
      [normalizedStationId],
    ),
    queryOne<{ count: string }>(
      'SELECT COUNT(1)::text AS count FROM pumps WHERE station_id = $1',
      [normalizedStationId],
    ),
    queryOne<{ count: string }>(
      'SELECT COUNT(1)::text AS count FROM tanks WHERE station_id = $1',
      [normalizedStationId],
    ),
    queryOne<{ count: string }>(
      'SELECT COUNT(1)::text AS count FROM nozzles WHERE station_id = $1 AND is_active = TRUE',
      [normalizedStationId],
    ),
    kvGet<PssXmlIdMap>(normalizedStationId, PSS_XML_KEYS.ID_MAP),
  ])

  const pssProductIds = mappedPssProductIds(idMap)
  const hasPssProductMap = Boolean(
    idMap?.version === 1 &&
    idMap.productDbIdByGradeId &&
    typeof idMap.productDbIdByGradeId === 'object',
  )

  let pssProductCount = 0
  if (hasPssProductMap && pssProductIds.length) {
    const pssProducts = await queryOne<{ count: string }>(
      `SELECT COUNT(1)::text AS count
         FROM products
        WHERE station_id = $1
          AND id::text = ANY($2::text[])`,
      [normalizedStationId, pssProductIds],
    )
    pssProductCount = Number(pssProducts?.count ?? 0)
  } else if (!hasPssProductMap) {
    // Compatibility fallback for stations imported before the PSS ID map was
    // persisted. Once an ID map exists, it is authoritative even if empty.
    const fuelProducts = await queryOne<{ count: string }>(
      `SELECT COUNT(1)::text AS count
         FROM products
        WHERE station_id = $1
          AND UPPER(COALESCE(product_class_code, '')) = 'FUEL'`,
      [normalizedStationId],
    )
    pssProductCount = Number(fuelProducts?.count ?? 0)
  }

  return {
    products: Number(products?.count ?? 0),
    pssProducts: pssProductCount,
    tanks: Number(tanks?.count ?? 0),
    pumps: Number(pumps?.count ?? 0),
    nozzles: Number(nozzles?.count ?? 0),
  }
}
