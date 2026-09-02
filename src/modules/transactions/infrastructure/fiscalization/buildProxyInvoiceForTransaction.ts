import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { getEnvValue } from '@/src/shared/config/envDb'
import { getDefaultTaxTypeForCountry } from '@/src/shared/server/config/countryCatalog'

import { mapTransactionToProxyInvoice } from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.mapper'
import { getTransactionDetailsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction-read.repository'
import { mapTransactionInvoiceLines } from '@/src/modules/transactions/infrastructure/persistence/transaction.mapper'

async function loadStation(stationId: string) {
  return await queryOne<any>(`SELECT * FROM fuel_stations WHERE id = $1`, [
    stationId,
  ])
}

async function loadCustomer(stationId: string, customerId: string) {
  return await queryOne<any>(
    `SELECT * FROM customers WHERE station_id = $1 AND id = $2`,
    [stationId, customerId],
  )
}

async function vatRateForCountry(stationId: string, country: string | null) {
  const c = String(country || '').toUpperCase()
  if (c === 'TZ') {
    return Number(
      (await getEnvValue(stationId, 'VPOS_VAT_RATE_TZ', '0.18')) || 0,
    )
  }
  if (c === 'KE') {
    return Number((await getEnvValue(stationId, 'VPOS_VAT_RATE_KE', '16')) || 0)
  }
  return Number(
    (await getEnvValue(stationId, 'VPOS_VAT_RATE_DEFAULT', '0')) || 0,
  )
}

async function resolveEnrichmentFromTables(
  stationId: string,
  transactionId: string,
  pumpNumber: number | null,
  fuelType?: string | null,
) {
  if (pumpNumber == null) return {}

  const pump = await queryOne<{ id: string }>(
    `SELECT id FROM pumps WHERE station_id = $1 AND pump_number = $2`,
    [stationId, pumpNumber],
  )
  if (!pump) return { pumpId: String(pumpNumber) }

  const nozzles = await queryAll<{
    id: string
    tank_id: string | null
    nozzle_number: number | null
  }>(
    `SELECT id, tank_id, nozzle_number FROM nozzles WHERE station_id = $1 AND pump_id = $2 AND is_active = TRUE ORDER BY nozzle_number`,
    [stationId, pump.id],
  )
  if (!nozzles.length) return { pumpId: String(pump.id) }

  let bestNozzle = nozzles[0]
  let bestProduct: any = null

  for (const nz of nozzles) {
    if (!nz.tank_id) continue
    const tank = await queryOne<{
      id: string
      name?: string
      product_id?: string | null
    }>(
      `SELECT id, name, product_id FROM tanks WHERE id = $1 AND station_id = $2`,
      [nz.tank_id, stationId],
    )
    if (!tank?.product_id) continue

    const product = await queryOne<any>(
      `SELECT id, product_id, product_code, product_name, unit_of_measure,
              product_class_code, product_type_code, commodity_code, hazardous_indicator,
              ext_product_id, ext_product_code, ext_product_class_code, ext_product_type_code,
              ext_description, ext_unit_of_measure, ext_unit_of_packaging, ext_unit_price,
              ext_currency, ext_tax_code, ext_hazardous_indicator, tax_rate
       FROM products WHERE id = $1 AND station_id = $2`,
      [tank.product_id, stationId],
    )
    if (!product) continue

    const fuelKey = String(fuelType ?? '')
      .trim()
      .toLowerCase()
    const matches =
      fuelKey &&
      ((product.product_name &&
        product.product_name.toLowerCase().includes(fuelKey)) ||
        (tank.name && tank.name.toLowerCase().includes(fuelKey)))
    if (matches || !bestProduct) {
      bestNozzle = nz
      bestProduct = { ...product, tankId: tank.id, tankName: tank.name }
      if (matches) break
    }
  }

  if (!bestProduct && bestNozzle.tank_id) {
    const tank = await queryOne<{
      id: string
      name?: string
      product_id?: string | null
    }>(
      `SELECT id, name, product_id FROM tanks WHERE id = $1 AND station_id = $2`,
      [bestNozzle.tank_id, stationId],
    )
    if (tank?.product_id) {
      const product = await queryOne<any>(
        `SELECT id, product_id, product_code, product_name, unit_of_measure,
                product_class_code, product_type_code, commodity_code, hazardous_indicator,
                ext_product_id, ext_product_code, ext_product_class_code, ext_product_type_code,
                ext_description, ext_unit_of_measure, ext_unit_of_packaging, ext_unit_price,
                ext_currency, ext_tax_code, ext_hazardous_indicator, tax_rate
         FROM products WHERE id = $1 AND station_id = $2`,
        [tank.product_id, stationId],
      )
      if (product) {
        bestProduct = { ...product, tankId: tank.id, tankName: tank.name }
      }
    }
  }

  const line = await queryOne<{
    unit_price: number | string | null
    tax_rate: number | string | null
    tax_code: string | null
  }>(
    `SELECT tl.unit_price,
            COALESCE(tl.tax_rate, p.tax_rate) AS tax_rate,
            tl.tax_code
     FROM transaction_lines tl
     LEFT JOIN products p
       ON p.id = tl.product_id
      AND p.station_id = $1
     WHERE tl.transaction_id = $2::uuid
     ORDER BY tl.created_at ASC
     LIMIT 1`,
    [stationId, transactionId],
  )

  return {
    pumpId: String(pump.id),
    nozzleId: String(bestNozzle.id),
    tankId:
      bestProduct?.tankId ??
      (bestNozzle.tank_id ? String(bestNozzle.tank_id) : null),
    gradeId: bestProduct?.product_id ?? bestProduct?.product_code ?? null,
    gradeName: bestProduct?.product_name ?? bestProduct?.tankName ?? null,
    productId: bestProduct?.ext_product_id ?? bestProduct?.product_id ?? null,
    productCode:
      bestProduct?.ext_product_code ?? bestProduct?.product_code ?? null,
    productClassCode:
      bestProduct?.ext_product_class_code ??
      bestProduct?.product_class_code ??
      null,
    productTypeCode:
      bestProduct?.ext_product_type_code ??
      bestProduct?.product_type_code ??
      null,
    unitOfMeasure:
      bestProduct?.ext_unit_of_measure ?? bestProduct?.unit_of_measure ?? null,
    unitOfPackaging: bestProduct?.ext_unit_of_packaging ?? null,
    unitPrice:
      bestProduct?.ext_unit_price != null
        ? Number(bestProduct.ext_unit_price)
        : line?.unit_price != null
          ? Number(line.unit_price)
          : null,
    taxRate:
      line?.tax_rate != null && Number.isFinite(Number(line.tax_rate))
        ? Number(line.tax_rate)
        : bestProduct?.tax_rate != null &&
            Number.isFinite(Number(bestProduct.tax_rate))
          ? Number(bestProduct.tax_rate)
          : null,
    currency: bestProduct?.ext_currency ?? null,
    taxCode: line?.tax_code ?? bestProduct?.ext_tax_code ?? null,
    commodityCode: bestProduct?.commodity_code ?? null,
    hazardousIndicator:
      bestProduct?.ext_hazardous_indicator != null
        ? bestProduct.ext_hazardous_indicator
        : (bestProduct?.hazardous_indicator ?? null),
    description:
      bestProduct?.ext_description ?? bestProduct?.product_name ?? null,
  }
}

export async function buildProxyInvoiceForTransaction(input: {
  stationId: string
  transactionId: string
  createdByName?: string | null
}) {
  const transaction = await getTransactionDetailsRepo(
    input.stationId,
    input.transactionId,
  )
  if (!transaction) return null

  const [station, customer] = await Promise.all([
    loadStation(input.stationId),
    transaction.customer_id
      ? loadCustomer(input.stationId, String(transaction.customer_id))
      : Promise.resolve(null),
  ])

  const country = station?.country
    ? String(station.country).toUpperCase()
    : null
  const defaultTaxType = await getDefaultTaxTypeForCountry(country)
  const vatRate =
    defaultTaxType?.rate != null
      ? Number(defaultTaxType.rate)
      : await vatRateForCountry(input.stationId, country)

  const pumpNumber =
    transaction.pump_number != null ? Number(transaction.pump_number) : null
  const enrichment = await resolveEnrichmentFromTables(
    input.stationId,
    input.transactionId,
    pumpNumber,
    transaction.fuel_type ?? null,
  )

  const invoice = mapTransactionToProxyInvoice({
    transaction: {
      ...transaction,
      lines: mapTransactionInvoiceLines(transaction.lines),
    },
    customer,
    station,
    vatRate,
    taxType: defaultTaxType?.code ?? null,
    taxRate: defaultTaxType?.rate ?? null,
    createdByName: input.createdByName ?? null,
    enrichment,
  })

  return {
    transaction,
    station,
    customer,
    invoice,
  }
}
