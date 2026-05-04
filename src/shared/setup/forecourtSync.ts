import crypto from 'node:crypto'

import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type PumpsConfig = {
  pumps: Array<{
    pumpId: string
    /** App-facing pump number. Defaults to pumpId for legacy imports. */
    pumpNumber?: string | number | null
    /** DOMS/PSS FuellingPoint ID. This is the preferred runtime identity for JPL events. */
    domsFpId?: string | number | null
    /** DOMS/PSS DeviceSubAddress. Used as a secondary stable identity when IP changes. */
    deviceSubAddress?: string | number | null
    pssPortNo?: string | number | null
    endpointHost?: string | null
    endpointPort?: string | number | null
    domsTopologyHash?: string | null
    nozzles: Array<{
      nozzleId: string
      tankId: string
      productId?: string
      productCode?: string
      productName?: string
      tankCode?: string
      tankName?: string
      domsGradeOptionId?: string | number | null
      domsGradeId?: string | number | null
      domsTankId?: string | number | null
      domsTopologyHash?: string | null
    }>
  }>
}

const toInt = (value: unknown) => {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

const toNullableInt = (value: unknown): number | null => {
  const n = toInt(value)
  return Number.isFinite(n) ? n : null
}

const nullableString = (value: unknown): string | null => {
  const s = String(value ?? '').trim()
  return s ? s : null
}

const sha256Hex = (value: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')

const buildPumpTopologyHash = (pump: PumpsConfig['pumps'][number]) =>
  sha256Hex({
    domsFpId: nullableString(pump.domsFpId ?? pump.pumpId),
    deviceSubAddress: nullableString(pump.deviceSubAddress),
    pssPortNo: nullableString(pump.pssPortNo),
    nozzles: (Array.isArray(pump.nozzles) ? pump.nozzles : [])
      .map((n) => ({
        nozzleId: nullableString(n.nozzleId),
        domsGradeOptionId: nullableString(n.domsGradeOptionId ?? n.nozzleId),
        domsGradeId: nullableString(n.domsGradeId),
        domsTankId: nullableString(n.domsTankId),
        tankId: nullableString(n.tankId),
      }))
      .sort((a, b) =>
        String(a.domsGradeOptionId ?? a.nozzleId ?? '').localeCompare(
          String(b.domsGradeOptionId ?? b.nozzleId ?? ''),
          undefined,
          { numeric: true },
        ),
      ),
  })

const buildNozzleTopologyHash = (
  nozzle: PumpsConfig['pumps'][number]['nozzles'][number],
) =>
  sha256Hex({
    nozzleId: nullableString(nozzle.nozzleId),
    domsGradeOptionId: nullableString(
      nozzle.domsGradeOptionId ?? nozzle.nozzleId,
    ),
    domsGradeId: nullableString(nozzle.domsGradeId),
    domsTankId: nullableString(nozzle.domsTankId),
    tankId: nullableString(nozzle.tankId),
  })

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

    const ensurePump = async (pump: PumpsConfig['pumps'][number]) => {
      const pumpNumber = toInt(pump?.pumpNumber ?? pump?.pumpId)
      if (!pumpNumber || pumpNumber <= 0) return null

      const domsFpId = toNullableInt(pump?.domsFpId ?? pump?.pumpId)
      const deviceSubAddress = toNullableInt(pump?.deviceSubAddress)
      const pssPortNo = toNullableInt(pump?.pssPortNo)
      const endpointHost = nullableString(pump?.endpointHost)
      const endpointPort = toNullableInt(pump?.endpointPort)
      const domsTopologyHash =
        nullableString(pump?.domsTopologyHash) ?? buildPumpTopologyHash(pump)

      let existing = null as { id: string; pump_number: number } | null

      if (domsFpId != null) {
        existing = await txQuery<{ id: string; pump_number: number }>(
          client,
          `SELECT id, pump_number
             FROM pumps
            WHERE station_id = $1 AND doms_fp_id = $2
            LIMIT 1`,
          [normalizedStationId, domsFpId],
        ).then((r) => r.rows[0] || null)
      }

      if (!existing && deviceSubAddress != null && pssPortNo != null) {
        existing = await txQuery<{ id: string; pump_number: number }>(
          client,
          `SELECT id, pump_number
             FROM pumps
            WHERE station_id = $1
              AND doms_pss_port_no = $2
              AND doms_device_sub_address = $3
            LIMIT 1`,
          [normalizedStationId, pssPortNo, deviceSubAddress],
        ).then((r) => r.rows[0] || null)
      }

      if (!existing && deviceSubAddress != null) {
        existing = await txQuery<{ id: string; pump_number: number }>(
          client,
          `SELECT id, pump_number
             FROM pumps
            WHERE station_id = $1 AND doms_device_sub_address = $2
            ORDER BY CASE WHEN doms_pss_port_no IS NULL THEN 1 ELSE 0 END, updated_at DESC
            LIMIT 1`,
          [normalizedStationId, deviceSubAddress],
        ).then((r) => r.rows[0] || null)
      }

      if (!existing) {
        existing = await txQuery<{ id: string; pump_number: number }>(
          client,
          `SELECT id, pump_number
             FROM pumps
            WHERE station_id = $1 AND pump_number = $2
            LIMIT 1`,
          [normalizedStationId, pumpNumber],
        ).then((r) => r.rows[0] || null)
      }

      const code =
        sanitizeCode(`PUMP_${pumpNumber}`, 50) || `PUMP_${pumpNumber}`
      const name = `Pump ${pumpNumber}`

      if (existing?.id) {
        await txQuery(
          client,
          `UPDATE pumps
              SET code = COALESCE(NULLIF(code, ''), $3),
                  name = COALESCE(NULLIF(name, ''), $4),
                  pump_number = $5,
                  doms_fp_id = COALESCE($6, doms_fp_id),
                  doms_device_sub_address = COALESCE($7, doms_device_sub_address),
                  doms_pss_port_no = COALESCE($8, doms_pss_port_no),
                  doms_endpoint_host = COALESCE($9, doms_endpoint_host),
                  doms_endpoint_port = COALESCE($10, doms_endpoint_port),
                  doms_topology_hash = COALESCE($11, doms_topology_hash),
                  doms_last_seen_at = NOW(),
                  updated_at = NOW()
            WHERE station_id = $1 AND id = $2`,
          [
            normalizedStationId,
            existing.id,
            code,
            name,
            pumpNumber,
            domsFpId,
            deviceSubAddress,
            pssPortNo,
            endpointHost,
            endpointPort,
            domsTopologyHash,
          ],
        )
        return existing.id
      }

      const pumpId = uuidv4()
      const inserted = await txQuery<{ id: string }>(
        client,
        `INSERT INTO pumps (
           id, station_id, code, name, status, has_nozzle_selector, pump_number,
           doms_fp_id, doms_device_sub_address, doms_pss_port_no,
           doms_endpoint_host, doms_endpoint_port, doms_topology_hash, doms_last_seen_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
         ON CONFLICT (station_id, pump_number) DO UPDATE SET
           code = EXCLUDED.code,
           name = EXCLUDED.name,
           doms_fp_id = COALESCE(EXCLUDED.doms_fp_id, pumps.doms_fp_id),
           doms_device_sub_address = COALESCE(EXCLUDED.doms_device_sub_address, pumps.doms_device_sub_address),
           doms_pss_port_no = COALESCE(EXCLUDED.doms_pss_port_no, pumps.doms_pss_port_no),
           doms_endpoint_host = COALESCE(EXCLUDED.doms_endpoint_host, pumps.doms_endpoint_host),
           doms_endpoint_port = COALESCE(EXCLUDED.doms_endpoint_port, pumps.doms_endpoint_port),
           doms_topology_hash = COALESCE(EXCLUDED.doms_topology_hash, pumps.doms_topology_hash),
           doms_last_seen_at = NOW(),
           updated_at = NOW()
         RETURNING id`,
        [
          pumpId,
          normalizedStationId,
          code,
          name,
          'ACTIVE',
          false,
          pumpNumber,
          domsFpId,
          deviceSubAddress,
          pssPortNo,
          endpointHost,
          endpointPort,
          domsTopologyHash,
        ],
      ).then((r) => r.rows[0] || null)

      return inserted?.id ?? pumpId
    }

    for (const p of pumps) {
      const pumpDbId = await ensurePump(p)
      if (!pumpDbId) continue

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

        const domsGradeOptionId = toNullableInt(
          n?.domsGradeOptionId ?? n?.nozzleId,
        )
        const domsGradeId = nullableString(n?.domsGradeId)
        const domsTankId = nullableString(n?.domsTankId)
        const domsTopologyHash =
          nullableString(n?.domsTopologyHash) ?? buildNozzleTopologyHash(n)

        let existingNozzle = null as { id: string } | null
        if (domsGradeOptionId != null) {
          existingNozzle = await txQuery<{ id: string }>(
            client,
            `SELECT id
               FROM nozzles
              WHERE station_id = $1
                AND pump_id = $2
                AND doms_grade_option_id = $3
              LIMIT 1`,
            [normalizedStationId, pumpDbId, domsGradeOptionId],
          ).then((r) => r.rows[0] || null)
        }

        if (!existingNozzle) {
          existingNozzle = await txQuery<{ id: string }>(
            client,
            `SELECT id
               FROM nozzles
              WHERE station_id = $1
                AND pump_id = $2
                AND nozzle_number = $3
              LIMIT 1`,
            [normalizedStationId, pumpDbId, nozzleNumber],
          ).then((r) => r.rows[0] || null)
        }

        if (existingNozzle?.id) {
          await txQuery(
            client,
            `UPDATE nozzles
                SET tank_id = $1,
                    nozzle_number = $2,
                    doms_grade_option_id = COALESCE($3, doms_grade_option_id),
                    doms_grade_id = COALESCE($4, doms_grade_id),
                    doms_tank_id = COALESCE($5, doms_tank_id),
                    doms_topology_hash = COALESCE($6, doms_topology_hash),
                    doms_last_seen_at = NOW(),
                    updated_at = NOW()
              WHERE id = $7 AND station_id = $8`,
            [
              tankId,
              nozzleNumber,
              domsGradeOptionId,
              domsGradeId,
              domsTankId,
              domsTopologyHash,
              existingNozzle.id,
              normalizedStationId,
            ],
          )
        } else {
          await txQuery(
            client,
            `INSERT INTO nozzles (
               id, station_id, pump_id, tank_id, nozzle_number,
               doms_grade_option_id, doms_grade_id, doms_tank_id,
               doms_topology_hash, doms_last_seen_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
             ON CONFLICT (pump_id, nozzle_number) DO UPDATE SET
               tank_id = EXCLUDED.tank_id,
               doms_grade_option_id = COALESCE(EXCLUDED.doms_grade_option_id, nozzles.doms_grade_option_id),
               doms_grade_id = COALESCE(EXCLUDED.doms_grade_id, nozzles.doms_grade_id),
               doms_tank_id = COALESCE(EXCLUDED.doms_tank_id, nozzles.doms_tank_id),
               doms_topology_hash = COALESCE(EXCLUDED.doms_topology_hash, nozzles.doms_topology_hash),
               doms_last_seen_at = NOW(),
               updated_at = NOW()`,
            [
              uuidv4(),
              normalizedStationId,
              pumpDbId,
              tankId,
              nozzleNumber,
              domsGradeOptionId,
              domsGradeId,
              domsTankId,
              domsTopologyHash,
            ],
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
      doms_fp_id: number | null
      doms_device_sub_address: number | null
      doms_pss_port_no: number | null
      doms_endpoint_host: string | null
      doms_endpoint_port: number | null
      nozzle_number: number
      doms_grade_option_id: number | null
      doms_grade_id: string | null
      doms_tank_id: string | null
      tank_id: string
      tank_code: string
      tank_name: string
      product_id: string
      product_code: string
      product_name: string
    }>(
      client,
      `SELECT pu.pump_number,
              pu.doms_fp_id,
              pu.doms_device_sub_address,
              pu.doms_pss_port_no,
              pu.doms_endpoint_host,
              pu.doms_endpoint_port,
              nz.nozzle_number,
              nz.doms_grade_option_id,
              nz.doms_grade_id,
              nz.doms_tank_id,
              tk.id as tank_id,
              tk.code as tank_code,
              tk.name as tank_name,
              pr.product_id,
              pr.product_code,
              pr.product_name
         FROM pumps pu
         JOIN nozzles nz ON nz.pump_id = pu.id
         JOIN tanks tk ON tk.id = nz.tank_id
         JOIN products pr ON pr.id = tk.product_id
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
      const item = {
        pumpId: String(row.doms_fp_id ?? pumpNumber),
        pumpNumber,
        domsFpId: row.doms_fp_id ?? undefined,
        deviceSubAddress: row.doms_device_sub_address ?? undefined,
        pssPortNo: row.doms_pss_port_no ?? undefined,
        endpointHost: row.doms_endpoint_host ?? undefined,
        endpointPort: row.doms_endpoint_port ?? undefined,
        nozzles: [] as any[],
      }
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
      domsGradeOptionId: row.doms_grade_option_id ?? undefined,
      domsGradeId: row.doms_grade_id ?? undefined,
      domsTankId: row.doms_tank_id ?? undefined,
    })
  }
  return { pumps }
}
