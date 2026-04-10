import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type PumpsConfig = {
  pumps: Array<{
    pumpId: string
    nozzles: Array<{
      nozzleId: string
      tankId: string
      productId?: string
      productCode?: string
      productName?: string
      tankCode?: string
      tankName?: string
    }>
  }>
}

const toInt = (value: unknown) => {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

const sanitizeCode = (raw: string, maxLen: number) => {
  const base = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base.length > maxLen ? base.slice(0, maxLen) : base
}

type ProductRow = {
  id: string
  product_id: string
  product_name: string
  product_code: string
}

export const syncForecourtFromPumpsConfig = async (
  stationId: string,
  config: PumpsConfig,
) => {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const pumps = Array.isArray(config?.pumps) ? config.pumps : []

  await withTransaction(async (client) => {
    const tankByProductId = new Map<string, string>()

    const resolveExistingTankForProduct = async (productId: string) => {
      const cached = tankByProductId.get(productId)
      if (cached) return cached
      const product = await txQuery<ProductRow>(
        client,
        `SELECT id, product_id, product_name, product_code FROM products WHERE station_id = $1 AND product_id = $2`,
        [normalizedStationId, productId],
      ).then((r) => r.rows[0] || null)
      if (!product?.id)
        throw new Error(`Unknown productId '${productId}' for station`)
      const existing = await txQuery<{ id: string }>(
        client,
        `SELECT id FROM tanks WHERE station_id = $1 AND product_id = $2 ORDER BY created_at ASC LIMIT 1`,
        [normalizedStationId, product.id],
      ).then((r) => r.rows[0] || null)
      if (!existing?.id)
        throw new Error(
          `No tank exists for productId '${productId}'. Create tanks first (Settings > Tanks).`,
        )
      tankByProductId.set(productId, existing.id)
      return existing.id
    }

    const ensureTankExists = async (tankId: string) => {
      const row = await txQuery<{ id: string }>(
        client,
        `SELECT id FROM tanks WHERE station_id = $1 AND id = $2 LIMIT 1`,
        [normalizedStationId, tankId],
      ).then((r) => r.rows[0] || null)
      if (!row?.id) throw new Error(`Unknown tankId '${tankId}' for station`)
      return row.id
    }

    const ensurePump = async (pumpNumber: number) => {
      const existing = await txQuery<{ id: string }>(
        client,
        `SELECT id FROM pumps WHERE station_id = $1 AND pump_number = $2 LIMIT 1`,
        [normalizedStationId, pumpNumber],
      ).then((r) => r.rows[0] || null)
      if (existing?.id) return existing.id
      const pumpId = uuidv4()
      const code =
        sanitizeCode(`PUMP_${pumpNumber}`, 50) || `PUMP_${pumpNumber}`
      await txQuery(
        client,
        `INSERT INTO pumps (id, station_id, code, name, status, has_nozzle_selector, pump_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (station_id, pump_number) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, updated_at = NOW()
         RETURNING id`,
        [
          pumpId,
          normalizedStationId,
          code,
          `Pump ${pumpNumber}`,
          'ACTIVE',
          false,
          pumpNumber,
        ],
      )
      return pumpId
    }

    for (const p of pumps) {
      const pumpNumber = toInt(p?.pumpId)
      if (!pumpNumber || pumpNumber <= 0) continue
      const pumpDbId = await ensurePump(pumpNumber)
      const nozzles = Array.isArray(p?.nozzles) ? p.nozzles : []
      for (const n of nozzles) {
        const nozzleNumber = toInt(n?.nozzleId)
        const tankIdRaw = String((n as any)?.tankId ?? '').trim()
        const productIdFallback = String((n as any)?.productId ?? '').trim()
        if (!nozzleNumber || nozzleNumber <= 0) continue
        const tankId = tankIdRaw
          ? await ensureTankExists(tankIdRaw)
          : productIdFallback
            ? await resolveExistingTankForProduct(productIdFallback)
            : ''
        if (!tankId) continue
        const existingNozzle = await txQuery<{ id: string }>(
          client,
          `SELECT id FROM nozzles WHERE station_id = $1 AND pump_id = $2 AND nozzle_number = $3 LIMIT 1`,
          [normalizedStationId, pumpDbId, nozzleNumber],
        ).then((r) => r.rows[0] || null)
        if (existingNozzle?.id) {
          await txQuery(
            client,
            `UPDATE nozzles SET tank_id = $1, updated_at = NOW() WHERE id = $2 AND station_id = $3`,
            [tankId, existingNozzle.id, normalizedStationId],
          )
        } else {
          await txQuery(
            client,
            `INSERT INTO nozzles (id, station_id, pump_id, tank_id, nozzle_number)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (pump_id, nozzle_number) DO UPDATE SET tank_id = EXCLUDED.tank_id, updated_at = NOW()`,
            [uuidv4(), normalizedStationId, pumpDbId, tankId, nozzleNumber],
          )
        }
      }
    }
  })
}

export const getPumpsConfigFromDb = async (stationId: string) => {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const rows = await withTransaction(async (client) =>
    txQuery<{
      pump_number: number
      nozzle_number: number
      tank_id: string
      tank_code: string
      tank_name: string
      product_id: string
      product_code: string
      product_name: string
    }>(
      client,
      `SELECT pu.pump_number, nz.nozzle_number, tk.id as tank_id, tk.code as tank_code, tk.name as tank_name, pr.product_id, pr.product_code, pr.product_name
     FROM pumps pu JOIN nozzles nz ON nz.pump_id = pu.id JOIN tanks tk ON tk.id = nz.tank_id JOIN products pr ON pr.id = tk.product_id
    WHERE pu.station_id = $1 AND nz.station_id = $1
    ORDER BY pu.pump_number ASC, nz.nozzle_number ASC`,
      [normalizedStationId],
    ).then((r) => r.rows),
  )

  const pumps: PumpsConfig['pumps'] = []
  const byPump = new Map<number, PumpsConfig['pumps'][number]>()
  for (const row of rows) {
    const pumpNumber = Number(row.pump_number)
    const nozzleNumber = Number(row.nozzle_number)
    const tankId = String(row.tank_id ?? '').trim()
    const tankCode = String(row.tank_code ?? '').trim()
    const tankName = String(row.tank_name ?? '').trim()
    const productId = String(row.product_id ?? '').trim()
    const productCode = String(row.product_code ?? '').trim()
    const productName = String(row.product_name ?? '').trim()
    if (!byPump.has(pumpNumber)) {
      const item = { pumpId: String(pumpNumber), nozzles: [] as any[] }
      byPump.set(pumpNumber, item)
      pumps.push(item)
    }
    byPump.get(pumpNumber)!.nozzles.push({
      nozzleId: String(nozzleNumber),
      tankId,
      tankCode,
      tankName,
      productId,
      productCode,
      productName,
    })
  }
  return { pumps }
}
