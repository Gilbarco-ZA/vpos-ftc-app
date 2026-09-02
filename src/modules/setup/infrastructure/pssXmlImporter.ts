import crypto from 'node:crypto'
import type {
  PssXmlConfig,
  PssXmlIdMap,
  PssXmlImportSummary,
} from '@/src/shared/integrations/pssXml/types'

import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import {
  ImportedProduct,
  ProxyProductDto,
} from '@/src/shared/fiscalization/proxy/contracts'
import { buildPssXmlImportSummary } from '@/src/shared/integrations/pssXml/importSummary'
import { PSS_XML_KEYS } from '@/src/shared/integrations/pssXml/keys'
import { parsePssConfigXml } from '@/src/shared/integrations/pssXml/xml'
import { normalizeTankConfig } from '@/src/shared/settings/tanksConfig'
import { KV_KEYS } from '@/src/shared/setup/api'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  getStationConfigJsonRepo,
  updateStationConfigJsonRepo,
} from '@/src/modules/admin-integrations/infrastructure/adminIntegrationsRepo'
import { syncForecourtFromPumpsConfig } from '@/src/modules/setup/infrastructure/setupRepo'
import { submitProductToProxy } from '@/src/modules/transactions/infrastructure/fiscalization/proxyClient'

const sha256Hex = (input: string) =>
  crypto.createHash('sha256').update(input, 'utf8').digest('hex')

const toPrice = (raw: number | null | undefined) => {
  if (raw == null) return 0
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  // PSS sample uses 2232 for 22.32 -> treat as minor units.
  return Math.round(n) / 100
}

const safeTrim = (v: unknown) => String(v ?? '').trim()

export class PssXmlImportValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(issues.join('; '))
    this.name = 'PssXmlImportValidationError'
    this.issues = issues
  }
}

const getGradeOptionTankIds = (gradeOption: {
  tankId?: string | null
  tankIds?: string[]
}) => {
  const candidates = Array.isArray(gradeOption.tankIds)
    ? gradeOption.tankIds
    : gradeOption.tankId
      ? [gradeOption.tankId]
      : []
  return Array.from(new Set(candidates.map(safeTrim).filter(Boolean)))
}

export const validateParsedPssTopology = (parsed: PssXmlConfig) => {
  const issues: string[] = []
  const tankIds = new Set(
    parsed.tanks.map((tank) => safeTrim(tank.id)).filter(Boolean),
  )
  const seenFpIds = new Set<string>()
  const seenPhysicalTuples = new Map<string, string>()

  for (const fp of parsed.fuellingPoints) {
    const fpId = safeTrim(fp.id)
    if (!fpId) continue
    if (seenFpIds.has(fpId)) issues.push(`Duplicate FuellingPoint ID '${fpId}'`)
    seenFpIds.add(fpId)

    if (
      fp.pssPortNo != null &&
      fp.physicalAddress != null &&
      fp.deviceSubAddress != null
    ) {
      const tuple = `${fp.pssPortNo}:${fp.physicalAddress}:${fp.deviceSubAddress}`
      const owner = seenPhysicalTuples.get(tuple)
      if (owner && owner !== fpId) {
        issues.push(
          `FuellingPoints '${owner}' and '${fpId}' share PSSPortNo/PhysicalAddress/DeviceSubAddress '${tuple}'`,
        )
      } else {
        seenPhysicalTuples.set(tuple, fpId)
      }
    }

    const gradeOptionIds = new Set<string>()
    const nozzleIds = new Set<string>()
    for (const gradeOption of fp.gradeOptions) {
      const gradeOptionId = safeTrim(gradeOption.id)
      const nozzleId = safeTrim(gradeOption.nozzleId) || gradeOptionId
      if (gradeOptionIds.has(gradeOptionId)) {
        issues.push(
          `Pump ${fpId} has duplicate GradeOption ID '${gradeOptionId}'`,
        )
      }
      gradeOptionIds.add(gradeOptionId)
      if (nozzleIds.has(nozzleId)) {
        issues.push(`Pump ${fpId} has duplicate NozzleId '${nozzleId}'`)
      }
      nozzleIds.add(nozzleId)

      for (const tankId of getGradeOptionTankIds(gradeOption)) {
        if (!tankIds.has(tankId)) {
          issues.push(
            `Pump ${fpId} GradeOption ${gradeOptionId} references unknown TankID '${tankId}'`,
          )
        }
      }
    }
  }

  if (issues.length) throw new PssXmlImportValidationError(issues)
}

export const buildPumpsPayloadFromPss = (
  parsed: PssXmlConfig,
  idMap: Pick<PssXmlIdMap, 'tankDbIdByTankId'>,
) => ({
  pumps: parsed.fuellingPoints
    .map((fp) => {
      const pumpId = safeTrim(fp.id)
      if (!pumpId) return null

      const nozzles = fp.gradeOptions
        .map((go) => {
          const gradeOptionId = safeTrim(go.id)
          const nozzleId = safeTrim(go.nozzleId) || gradeOptionId
          const pssTankIds = getGradeOptionTankIds(go)
          const primaryPssTankId = pssTankIds[0] ?? ''
          if (!gradeOptionId || !nozzleId || !primaryPssTankId) return null

          const tankDbId = idMap.tankDbIdByTankId[primaryPssTankId]
          if (!tankDbId) return null

          return {
            nozzleId,
            tankId: tankDbId,
            domsGradeOptionId: gradeOptionId,
            domsGradeId: safeTrim(go.gradeId) || null,
            domsTankId: primaryPssTankId,
            domsTankIds: pssTankIds,
          }
        })
        .filter(Boolean) as Array<{
        nozzleId: string
        tankId: string
        domsGradeOptionId: string
        domsGradeId: string | null
        domsTankId: string
        domsTankIds: string[]
      }>

      return nozzles.length
        ? {
            pumpId,
            pumpNumber: pumpId,
            domsFpId: pumpId,
            physicalAddress: fp.physicalAddress ?? null,
            deviceSubAddress: fp.deviceSubAddress ?? null,
            pssPortNo: fp.pssPortNo ?? null,
            endpointHost: safeTrim(fp.ipAddress) || null,
            endpointPort: fp.tcpUdpPortNo ?? null,
            nozzles,
          }
        : null
    })
    .filter(Boolean),
})

const FUEL_CATEGORY_CODE = 'FUEL'
const FUEL_CATEGORY_NAME = 'Fuel'
const FUEL_CATEGORY_ICON = 'Fuel'

const ensureFuelCategory = async (client: any, stationId: string) => {
  const selectExisting = async () =>
    await txQuery<{ id: string }>(
      client,
      `SELECT id
         FROM product_categories
        WHERE station_id = $1
          AND (UPPER(code) = $2 OR LOWER(name) = LOWER($3))
        ORDER BY CASE WHEN UPPER(code) = $2 THEN 0 ELSE 1 END,
                 sort_order ASC,
                 name ASC
        LIMIT 1`,
      [stationId, FUEL_CATEGORY_CODE, FUEL_CATEGORY_NAME],
    ).then((result) => result.rows[0] ?? null)

  const existing = await selectExisting()

  if (existing?.id) {
    await txQuery(
      client,
      `UPDATE product_categories
          SET is_active = TRUE,
              updated_at = NOW()
        WHERE station_id = $1
          AND id = $2`,
      [stationId, existing.id],
    )
    return existing.id
  }

  try {
    const inserted = await txQuery<{ id: string }>(
      client,
      `INSERT INTO product_categories (
         id,
         station_id,
         code,
         name,
         icon,
         sort_order,
         is_active,
         created_at,
         updated_at
       )
       SELECT
         $1,
         $2,
         $3,
         $4,
         $5,
         COALESCE(MAX(sort_order), -1) + 1,
         TRUE,
         NOW(),
         NOW()
       FROM product_categories
       WHERE station_id = $2
       RETURNING id`,
      [
        uuidv4(),
        stationId,
        FUEL_CATEGORY_CODE,
        FUEL_CATEGORY_NAME,
        FUEL_CATEGORY_ICON,
      ],
    ).then((result) => result.rows[0] ?? null)

    if (!inserted?.id) throw new Error('Failed to create Fuel category')
    return inserted.id
  } catch (error: any) {
    if (
      !String(error?.message || '')
        .toLowerCase()
        .includes('duplicate')
    ) {
      throw error
    }

    const concurrent = await selectExisting()
    if (concurrent?.id) return concurrent.id
    throw error
  }
}

const ensureImportedTankGroup = async (
  client: any,
  stationId: string,
  pssGroupId: string,
) => {
  const raw = safeTrim(pssGroupId)
  if (!raw) return null
  const code = `pss-${raw}`.slice(0, 50)
  const name = `PSS Tank Group ${raw}`
  const row = await txQuery<{ id: string }>(
    client,
    `INSERT INTO tank_groups (id, station_id, code, name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (station_id, code) DO UPDATE SET
       name = EXCLUDED.name,
       updated_at = NOW()
     RETURNING id`,
    [uuidv4(), stationId, code, name],
  ).then((result) => result.rows[0] ?? null)
  return row?.id ?? null
}

const applyPssJplDefaults = async (stationId: string) => {
  const { configJson } = await getStationConfigJsonRepo(stationId)
  if (!configJson || typeof configJson !== 'object') return

  const integrations = { ...(configJson.integrations ?? {}) }
  const existingJpl = { ...(integrations.jpl ?? {}) }
  const nextJpl = {
    ...existingJpl,
    host: safeTrim(existingJpl.host) || '127.0.0.1',
    enabledApcs: Array.from(
      new Set([
        ...(Array.isArray(existingJpl.enabledApcs)
          ? existingJpl.enabledApcs
          : []),
        'apc1',
        'apc2',
      ]),
    ),
  }
  const nextBackend =
    safeTrim(integrations.posBackend).toLowerCase() === 'none' ||
    !safeTrim(integrations.posBackend)
      ? 'jpl'
      : integrations.posBackend

  const unchanged =
    integrations.posBackend === nextBackend &&
    JSON.stringify(integrations.jpl ?? {}) === JSON.stringify(nextJpl)
  if (unchanged) return

  await updateStationConfigJsonRepo({
    stationId,
    username: 'PSS_IMPORT',
    nextConfigJson: {
      ...configJson,
      integrations: {
        ...integrations,
        posBackend: nextBackend,
        jpl: nextJpl,
      },
    },
  })
}

const resolveCurrency = async (stationId: string) => {
  const sp = await kvGet<any>(stationId, KV_KEYS.SITE_PROFILE)
  const currency =
    safeTrim(sp?.currency) || process.env.DEFAULT_CURRENCY?.trim() || 'USD'
  return currency
}

const pickPrimaryPriceGroup = (cfg: PssXmlConfig) => {
  // Heuristic: choose PriceGroup ID=1 if present, else first.
  const pg1 = cfg.priceGroups.find((p) => p.id === '1')
  return pg1 || cfg.priceGroups[0] || null
}

const buildTankConfigFromPss = (parsed: PssXmlConfig) => {
  const gradeIdToName = new Map<string, string>()
  for (const g of parsed.grades) {
    const id = safeTrim(g.id)
    const name = safeTrim(g.name)
    if (!id || !name) continue
    gradeIdToName.set(id, name)
  }

  // Map TankID -> GradeID based on fuelling point GradeOptions.
  const tankGradeIdByTankId = new Map<string, string>()
  const usedGradeIds = new Set<string>()

  for (const fp of parsed.fuellingPoints) {
    for (const go of fp.gradeOptions) {
      const gradeId = safeTrim(go.gradeId)
      if (!gradeId) continue

      for (const tankId of getGradeOptionTankIds(go)) {
        if (!tankGradeIdByTankId.has(tankId)) {
          tankGradeIdByTankId.set(tankId, gradeId)
        }
      }
      usedGradeIds.add(gradeId)
    }
  }

  // Ensure tanks with ProductID but no GradeOption mapping still seed grades.
  for (const t of parsed.tanks) {
    const tankId = safeTrim(t.id)
    if (!tankId) continue
    const productGradeId = safeTrim(t.productId)
    if (!productGradeId) continue
    usedGradeIds.add(productGradeId)
    if (!tankGradeIdByTankId.has(tankId)) {
      tankGradeIdByTankId.set(tankId, productGradeId)
    }
  }

  // Derive grades: prefer grades actually referenced on the forecourt.
  const grades: string[] = []
  if (usedGradeIds.size) {
    Array.from(usedGradeIds)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach((gradeId) => {
        const name = gradeIdToName.get(gradeId)
        if (name) grades.push(name)
      })
  } else {
    for (const g of parsed.grades) {
      const name = safeTrim(g.name)
      if (name) grades.push(name)
    }
  }

  // Derive one virtual tank per physical PSS tank that maps to a grade.
  const tankGradeNames: string[] = []
  const tanksSorted = [...parsed.tanks].sort((a, b) => {
    const aid = Number(safeTrim(a.id))
    const bid = Number(safeTrim(b.id))
    if (Number.isFinite(aid) && Number.isFinite(bid)) return aid - bid
    return safeTrim(a.id).localeCompare(safeTrim(b.id), undefined, {
      numeric: true,
    })
  })

  for (const t of tanksSorted) {
    const tankId = safeTrim(t.id)
    if (!tankId) continue
    const gradeId = tankGradeIdByTankId.get(tankId)
    if (!gradeId) continue
    const gradeName = gradeIdToName.get(gradeId)
    if (!gradeName) continue
    tankGradeNames.push(gradeName)
  }

  const tanks = tankGradeNames.length ? tankGradeNames : grades.slice()
  const activeTanks = Array<boolean>(tanks.length).fill(true)

  return normalizeTankConfig({
    grades,
    tanks,
    activeTanks,
  })
}

export type ImportPssXmlResult = {
  checksum: string
  importSummary: PssXmlImportSummary
  importedProducts: number
  importedTanks: number
  importedPumps: number
}

type TankConfig = {
  tanks: Array<{
    tankNumber: number
    name?: string | null | undefined
    grade: string
    activeTanks?: boolean | undefined
  }>
  grades: string[]
  gradeLimits: any | null
  tankLevels: any | null
}

export function buildTankConfigFromParsed(parsed: any): TankConfig {
  const grades = Array.isArray(parsed?.grades) ? parsed.grades : []
  const tanks = Array.isArray(parsed?.tanks) ? parsed.tanks : []

  const gradeIdToName = new Map<string, string>()
  for (const g of grades) {
    if (g?.id != null && g?.name)
      gradeIdToName.set(String(g.id), String(g.name))
  }

  // Preserve grade order from XML
  const orderedGradeNames = grades
    .map((g: any) => String(g?.name ?? '').trim())
    .filter(Boolean)

  // Activate exactly one “virtual tank” per grade (first occurrence)
  const seenGrade = new Set<string>()

  const tankConfigTanks = tanks
    .map((t: any) => {
      const tankNumber = Number(t?.tankNumber ?? t?.number ?? t?.id)
      if (!Number.isFinite(tankNumber)) return null

      const gradeName =
        gradeIdToName.get(String(t?.gradeId ?? t?.grade ?? '')) ??
        String(t?.gradeName ?? '').trim()

      if (!gradeName) return null

      const firstForGrade = !seenGrade.has(gradeName)
      if (firstForGrade) seenGrade.add(gradeName)

      return {
        tankNumber,
        name: t?.name ?? null,
        grade: gradeName,
        activeTanks: firstForGrade,
      }
    })
    .filter(Boolean) as TankConfig['tanks']

  const next: TankConfig = {
    tanks: tankConfigTanks,
    grades: orderedGradeNames.length
      ? orderedGradeNames
      : Array.from(seenGrade),
    gradeLimits: null,
    tankLevels: null,
  }

  const normalized = normalizeTankConfig({
    grades: next.grades,
    tanks: next.tanks.map((t) => t.grade),
    activeTanks: next.tanks.map((t) => !!t.activeTanks),
  })

  return {
    tanks: next.tanks.map((t, index) => ({
      ...t,
      grade: normalized.tanks[index] ?? t.grade,
      activeTanks: normalized.activeTanks[index] ?? false,
    })),
    grades: normalized.grades,
    gradeLimits: null,
    tankLevels: null,
  }
}

/**
 * Import PSS config XML and upsert relevant topology into the VPOS DB:
 * - products (from Grades)
 * - tanks (from Devices/Tanks)
 * - pumps + nozzles mapping (from Devices/FuellingPoints/GradeOptions)
 *
 * Also persists the raw XML, compact import summary, and PSS<->DB ID mapping into station_kv.
 */
export const importPssConfigXml = async (args: {
  stationId: string
  xml: string
  sourcePath?: string
}): Promise<ImportPssXmlResult> => {
  const { stationId, xml, sourcePath } = args
  const checksum = sha256Hex(xml)

  const parsed = parsePssConfigXml(xml)
  validateParsedPssTopology(parsed)
  const currency = await resolveCurrency(stationId)

  const primaryPriceGroup = pickPrimaryPriceGroup(parsed)

  const importedAt = new Date().toISOString()
  const idMap: PssXmlIdMap = {
    version: 1,
    sourcePath: sourcePath || undefined,
    sourceChecksum: checksum,
    importedAt,
    productDbIdByGradeId: {},
    tankDbIdByTankId: {},
    pumpDbIdByFpId: {},
    nozzleDbIdByFpIdGradeOptionId: {},
  }

  // 1) Upsert products + tanks in a single transaction.
  const { importedProductsCount, importedProducts, importedTanks } =
    await withTransaction(async (client) => {
      let productsCount = 0
      let tanksCount = 0
      const productList = []
      const fuelCategoryId = await ensureFuelCategory(client, stationId)

      for (const g of parsed.grades) {
        const gradeId = safeTrim(g.id)
        if (!gradeId) continue

        const productName = safeTrim(g.name) || `Grade ${gradeId}`
        const unitPrice = toPrice(primaryPriceGroup?.pricesByGradeId?.[gradeId])

        const row = await txQuery<{
          id: string
          code: string
          name: string
          price: number
          currency: string
          taxCode?: string | null
          taxRate?: number | null
          hazardous?: boolean
          category?: string | null
        }>(
          client,
          `INSERT INTO products (
             id,
             station_id,
             product_id,
             product_code,
             product_name,
             unit_price,
             unit_cost,
             currency,
             tax_rate,
             category_id,
             category,
             product_class_code,
             product_type_code,
             tax_code,
             commodity_code,
             hazardous_indicator,
             created_by_name,
             is_online,
             last_sync_status,
             last_sync_at,
             last_sync_message
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
           )
           ON CONFLICT (station_id, product_id) DO UPDATE SET
             product_code = EXCLUDED.product_code,
             product_name = EXCLUDED.product_name,
             unit_price = EXCLUDED.unit_price,
             currency = EXCLUDED.currency,
             category_id = COALESCE(EXCLUDED.category_id, products.category_id),
             category = COALESCE(EXCLUDED.category, products.category),
             product_class_code = COALESCE(EXCLUDED.product_class_code, products.product_class_code),
             product_type_code = COALESCE(EXCLUDED.product_type_code, products.product_type_code),
             tax_code = COALESCE(EXCLUDED.tax_code, products.tax_code),
             updated_at = NOW()
           RETURNING id, product_code as code, product_name as name, unit_price as price, currency, tax_code as taxCode, tax_rate as taxRate, hazardous_indicator as hazardous, category`,
          [
            uuidv4(),
            stationId,
            gradeId,
            `G${gradeId}`,
            productName,
            unitPrice,
            0,
            currency,
            16,
            fuelCategoryId,
            FUEL_CATEGORY_NAME,
            'FUEL',
            'FUEL',
            'VAT',
            null,
            false,
            'PSS_IMPORT',
            false,
            null,
            null,
            null,
          ],
        ).then((r) => r.rows[0])

        if (row?.id) {
          idMap.productDbIdByGradeId[gradeId] = String(row.id)
          productList.push(row)
          productsCount += 1
        }
      }

      const gaugesByTankId = new Map<string, string[]>()
      for (const gauge of parsed.tankGauges ?? []) {
        const gaugeId = safeTrim(gauge.id)
        const referencedTankId = safeTrim(gauge.tankId)
        if (!gaugeId || !referencedTankId) continue
        const values = gaugesByTankId.get(referencedTankId) ?? []
        values.push(gaugeId)
        gaugesByTankId.set(referencedTankId, values)
      }

      for (const t of parsed.tanks) {
        const tankId = safeTrim(t.id)
        if (!tankId) continue

        const pssProductId = safeTrim(t.productId)
        const productDbId = pssProductId
          ? idMap.productDbIdByGradeId[pssProductId]
          : undefined

        if (!productDbId) {
          // Tank refers to a product we don't have. Skip for now.
          continue
        }

        const code = `PSS_TANK_${tankId}`
        const name = `Tank ${tankId}`

        const row = await txQuery<{ id: string }>(
          client,
          `INSERT INTO tanks (
             id,
             station_id,
             code,
             name,
             status,
             product_id,
             capacity_litres,
             low_level_litres,
             critical_level_litres,
             tank_group_id,
             doms_tank_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (station_id, code) DO UPDATE SET
             name = EXCLUDED.name,
             status = EXCLUDED.status,
             product_id = EXCLUDED.product_id,
             tank_group_id = COALESCE(EXCLUDED.tank_group_id, tanks.tank_group_id),
             doms_tank_id = COALESCE(EXCLUDED.doms_tank_id, tanks.doms_tank_id),
             updated_at = NOW()
           RETURNING id`,
          [
            uuidv4(),
            stationId,
            code,
            name,
            'ACTIVE',
            productDbId,
            0,
            null,
            null,
            await ensureImportedTankGroup(
              client,
              stationId,
              safeTrim(t.tankGroupId),
            ),
            (() => {
              const candidates = gaugesByTankId.get(tankId) ?? []
              if (candidates.length === 1) return candidates[0]
              const sameIdGauge = (parsed.tankGauges ?? []).find(
                (gauge) => safeTrim(gauge.id) === tankId,
              )
              return sameIdGauge ? tankId : null
            })(),
          ],
        ).then((r) => r.rows[0])

        if (row?.id) {
          idMap.tankDbIdByTankId[tankId] = String(row.id)
          tanksCount += 1
        }
      }
      return {
        importedProductsCount: productsCount,
        importedProducts: productList,
        importedTanks: tanksCount,
      }
    })

  // 2) Build pumps config payload and reconcile the authoritative DOMS topology.
  const pumpsPayload = buildPumpsPayloadFromPss(parsed, idMap)

  if (pumpsPayload.pumps.length) {
    await syncForecourtFromPumpsConfig(stationId, pumpsPayload as any, {
      authoritativeDomsSnapshot: true,
    })

    // Persist the DB UUIDs assigned during reconciliation so future export and support tooling
    // can compare DOMS FuellingPoint/GradeOption identities with app rows.
    await withTransaction(async (client) => {
      const domsFpIds = pumpsPayload.pumps
        .map((p: any) => Number(p.domsFpId ?? p.pumpId))
        .filter((n: number) => Number.isFinite(n))

      const pumpRows = await txQuery<{
        id: string
        doms_fp_id: number | null
        pump_number: number
      }>(
        client,
        `SELECT id, doms_fp_id, pump_number
           FROM pumps
          WHERE station_id = $1
            AND COALESCE(doms_fp_id, pump_number) = ANY($2::int[])`,
        [stationId, domsFpIds],
      )
      for (const row of pumpRows.rows) {
        const fpId = String(row.doms_fp_id ?? row.pump_number)
        idMap.pumpDbIdByFpId![fpId] = String(row.id)
      }

      const nozzleRows = await txQuery<{
        id: string
        fp_id: number | null
        pump_number: number
        doms_grade_option_id: number | null
        nozzle_number: number
      }>(
        client,
        `SELECT n.id,
                p.doms_fp_id AS fp_id,
                p.pump_number,
                n.doms_grade_option_id,
                n.nozzle_number
           FROM nozzles n
           JOIN pumps p ON p.id = n.pump_id AND p.station_id = n.station_id
          WHERE n.station_id = $1
            AND n.is_active = TRUE
            AND p.status <> 'INACTIVE'
            AND COALESCE(p.doms_fp_id, p.pump_number) = ANY($2::int[])`,
        [stationId, domsFpIds],
      )
      for (const row of nozzleRows.rows) {
        const fpId = String(row.fp_id ?? row.pump_number)
        const goId = String(row.doms_grade_option_id ?? row.nozzle_number)
        idMap.nozzleDbIdByFpIdGradeOptionId![fpId + ':' + goId] = String(row.id)
      }
    })

    // Best-effort: update has_nozzle_selector flag based on nozzle count.
    await withTransaction(async (client) => {
      await txQuery(
        client,
        `UPDATE pumps p
            SET has_nozzle_selector = sub.cnt > 1,
                updated_at = NOW()
           FROM (
             SELECT pu.id AS pump_id, COUNT(nz.id) AS cnt
               FROM pumps pu
               JOIN nozzles nz ON nz.pump_id = pu.id
              WHERE pu.station_id = $1
                AND nz.station_id = $1
                AND nz.is_active = TRUE
              GROUP BY pu.id
           ) sub
          WHERE p.id = sub.pump_id AND p.station_id = $1`,
        [stationId],
      )
    })
  }

  // 3) Persist authoritative XML, compact metadata, and the export ID map.
  // The parsed object remains in memory for this import only; station_kv must not
  // retain a second full representation of the same XML.
  const tankConfigFromPss = buildTankConfigFromPss(parsed)
  const importSummary = buildPssXmlImportSummary({
    parsed,
    sourceChecksum: checksum,
    sourcePath: sourcePath ?? null,
    importedAt,
    sourceBytes: Buffer.byteLength(xml, 'utf8'),
    importedProducts: importedProductsCount,
    importedTanks,
    importedPumps: pumpsPayload.pumps.length,
  })
  await Promise.all([
    kvSet(stationId, PSS_XML_KEYS.RAW_XML, xml),
    kvSet(stationId, PSS_XML_KEYS.IMPORT_SUMMARY, importSummary),
    kvSet(stationId, PSS_XML_KEYS.ID_MAP, idMap),
    kvSet(stationId, PSS_XML_KEYS.LAST_IMPORT_AT, importedAt),
    kvSet(stationId, PSS_XML_KEYS.LAST_IMPORT_CHECKSUM, checksum),
    kvSet(stationId, PSS_XML_KEYS.LAST_IMPORT_ERROR, null),
    kvSet(stationId, KV_KEYS.TANKS_CONFIG, tankConfigFromPss),
  ])

  // 4) Record import
  // If the migration/table exists, we record it. If not, ignore.
  try {
    await withTransaction(async (client) => {
      await txQuery(
        client,
        `INSERT INTO config_imports (id, station_id, source_path, source_checksum, status, message)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          uuidv4(),
          stationId,
          sourcePath || 'pss_xml',
          checksum,
          'IMPORTED',
          `Imported products=${importedProductsCount} tanks=${importedTanks} pumps=${pumpsPayload.pumps.length}`,
        ],
      )
    })
  } catch {}

  await applyPssJplDefaults(stationId)

  const proxyProducts = mapToProxyProducts(importedProducts, {
    createdByName: 'PSS Config Import',
  })

  try {
    const stationId = getStationId()
    for (const product of proxyProducts) {
      await submitProductToProxy(stationId, product, {
        idempotencyKey: `${stationId}:${product.productId}`,
      })
    }
  } catch (err) {
    logger.error('[pssXml]', {
      msg: 'Failed to push products to proxy',
      error: err,
    })
  }

  return {
    checksum,
    importSummary,
    importedProducts: importedProductsCount,
    importedTanks,
    importedPumps: pumpsPayload.pumps.length,
  }
}

function mapToProxyProducts(
  importedProducts: ImportedProduct[],
  options?: { createdByName?: string },
): ProxyProductDto[] {
  const createdByName = options?.createdByName ?? 'PSS Import'

  return importedProducts.map(
    (p): ProxyProductDto => ({
      devFlowOverride: undefined, // or some flag if you use it
      productId: String(p.id), // decide what you want to expose as productId
      productCode: String(p.code),
      productClassCode: null, // fill in if you have it
      productTypeCode: null, // fill in if you have it
      productName: p.name,
      category: p.category ?? null,
      unitOfMeasure: 'L', // for fuel; change if you also import dry stock
      unitOfPackaging: null,
      packSize: null,
      unitPrice: p.price ?? 0,
      unitCost: 0, // or your internal cost if available
      currency: p.currency ?? process.env.DEFAULT_CURRENCY?.trim() ?? 'USD',
      commodityCode: null,
      barcode: null,
      taxCode: p.taxCode ?? null,
      taxRate: p.taxRate ?? null,
      hazardousIndicator: !!p.hazardous,
      createdByName,
      inUse: true,
    }),
  )
}
