import { queryAll, queryOne } from '@/src/platform/db/postgres'

import type { TraPaymentType, TraVatRate } from './traReceipt'
import { calculateTanzaniaGrossTotal } from '../domain/grossTotal'
import { readTanzaniaFiscalConfig } from './config'
import { normalizeTanzaniaTankId } from './transactionTankProjection'
import { normalizeTraPaymentType } from './traReceipt'
import { dateParts } from './xml'

export type TanzaniaDailyTotalTank = {
  tankId: string
  tankProdName: string
  saleNumber: number
  startVolume: number
  atgDeliveryVolume: number
  saleVolume: number
  measuredEndVolume: number
  calculatedEndVolume: number
  volumeDifference: number
}

export type TanzaniaDailyTotalRequest = {
  reportDate: string
  reportTime: string
  zNumber: string
  dailyTotalAmount: number
  grossTotal: number
  discountsTotal: number
  netA: number
  netB: number
  netC: number
  netD: number
  netE: number
  taxA: number
  taxB: number
  taxC: number
  taxD: number
  taxE: number
  pmtCash: number
  pmtCard: number
  pmtCheque: number
  pmtInvoice: number
  pmtMobile: number
  ticketsFiscalCount: number
  ticketsNonFiscal: number
  ticketsVoid: number
  ticketsVoidTotal: number
  vatRateA: number
  vatRateB: number
  vatRateC: number
  vatRateD: number
  vatRateE: number
  totalStnVolume: number
  totalPetrol: number
  totalDiesel: number
  totalKerosene: number
  trnPetrol: number
  trnDiesel: number
  trnKerosene: number
  unitPricePetrol: number
  unitPriceDiesel: number
  unitPriceKerosene: number
  petrolTotalAmount: number
  dieselTotalAmount: number
  keroseneTotalAmount: number
  tanks?: TanzaniaDailyTotalTank[]
}

type DailyTransaction = {
  id: string
  total_amount: string | number
  volume: string | number | null
  fuel_type: string | null
  grade_name: string | null
  payment_type: string | null
  tank_product_type: string | null
  tank_product_name: string | null
  fallback_tax_code: string | null
  fallback_tax_rate: string | number | null
}

type DailyLine = {
  transaction_id: string
  quantity: string | number
  unit_price: string | number
  tax_code: string | null
  tax_rate: string | number | null
  product_name: string | null
  product_type_code: string | null
  category_name: string | null
}

type DailyTankRow = {
  tank_id: string
  doms_tank_id: string | null
  tank_code: string | null
  tank_name: string | null
  product_name: string | null
  captured_at: string | Date | null
  measured_end_volume: string | number | null
  sale_number: string | number | null
  sale_volume: string | number | null
  delivery_volume: string | number | null
}

type TaxBucket = { net: number; tax: number; rates: Set<number> }
type FuelBucket = {
  volume: number
  amount: number
  transactionIds: Set<string>
}

const money = (value: number) => Number(value.toFixed(2))
const volume = (value: number) => Number(value.toFixed(3))

export function buildTanzaniaDailyTotalTank(args: {
  tankId: string
  tankProdName: string
  saleNumber: number
  saleVolume: number
  deliveryVolume: number
  measuredEndVolume: number
}): TanzaniaDailyTotalTank {
  const saleVolume = volume(args.saleVolume)
  const deliveryVolume = volume(args.deliveryVolume)
  const measuredEndVolume = volume(args.measuredEndVolume)
  const startVolume = volume(measuredEndVolume + saleVolume - deliveryVolume)
  if (startVolume < 0) {
    throw new Error(
      `Tanzania daily tank ${args.tankId} derives a negative opening volume; verify ATG and inventory movements.`,
    )
  }
  const calculatedEndVolume = volume(startVolume + deliveryVolume - saleVolume)

  return {
    tankId: args.tankId,
    tankProdName: args.tankProdName,
    saleNumber: Math.max(0, Math.trunc(args.saleNumber)),
    startVolume,
    atgDeliveryVolume: deliveryVolume,
    saleVolume,
    measuredEndVolume,
    calculatedEndVolume,
    volumeDifference: volume(measuredEndVolume - calculatedEndVolume),
  }
}

function normalizeRatePercent(value: unknown, fallbackPercent: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallbackPercent
  return parsed <= 1 ? parsed * 100 : parsed
}

export function requireTanzaniaTaxBucket(value: unknown): TraVatRate {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
  if (/^[A-E]$/.test(raw)) return raw as TraVatRate
  if (/^[1-5]$/.test(raw)) {
    return String.fromCharCode(64 + Number(raw)) as TraVatRate
  }
  if (raw === 'Z') {
    throw new Error(
      'Tanzania TaxCode Z is not supported by vpos-proxy and cannot be submitted in Tanzania daily totals.',
    )
  }
  throw new Error(
    `Unsupported Tanzania tax bucket "${raw || '(empty)'}". The Tanzania API accepts A-E; configure an explicit authority bucket mapping before submission.`,
  )
}

function addTax(bucket: TaxBucket, gross: number, ratePercent: number): void {
  const divisor = 1 + ratePercent / 100
  const net = ratePercent > 0 ? gross / divisor : gross
  bucket.net += net
  bucket.tax += gross - net
  bucket.rates.add(ratePercent)
}

function classifyFuelText(
  values: Array<string | null | undefined>,
): keyof FuelTotals | null {
  const text = values.filter(Boolean).join(' ').toUpperCase()

  if (/(KEROSENE|PARAFFIN)/.test(text)) return 'kerosene'
  if (/(DIESEL|AGO)/.test(text)) return 'diesel'
  if (/(PETROL|PMS|GASOLINE|UNLEADED|OCTANE)/.test(text)) return 'petrol'
  return null
}

function classifyFuel(transaction: DailyTransaction): keyof FuelTotals | null {
  return classifyFuelText([
    transaction.fuel_type,
    transaction.grade_name,
    transaction.tank_product_type,
    transaction.tank_product_name,
  ])
}

function classifyFuelLine(line: DailyLine): keyof FuelTotals | null {
  return classifyFuelText([
    line.product_name,
    line.product_type_code,
    line.category_name,
  ])
}

function isFuelCategory(value: unknown): boolean {
  return (
    String(value ?? '')
      .trim()
      .toUpperCase() === 'FUEL'
  )
}

type FuelTotals = {
  petrol: FuelBucket
  diesel: FuelBucket
  kerosene: FuelBucket
}

function uniqueRate(bucket: TaxBucket, code: TraVatRate): number {
  const rates = Array.from(bucket.rates).filter((rate) => rate > 0)
  const unique = Array.from(
    new Set(rates.map((rate) => Number(rate.toFixed(4)))),
  )
  if (unique.length > 1) {
    throw new Error(
      `Tanzania tax bucket ${code} contains multiple VAT rates (${unique.join(', ')}); daily-totals supports one rate per bucket.`,
    )
  }
  return unique[0] ?? 0
}

export function buildTanzaniaDailyTotalRequest(args: {
  businessDate: string
  reportTime: string
  transactions: DailyTransaction[]
  lines: DailyLine[]
  grossTotal: number
  defaultVatRatePercent: number
  tanks?: TanzaniaDailyTotalTank[]
}): TanzaniaDailyTotalRequest {
  const taxBuckets: Record<TraVatRate, TaxBucket> = {
    A: { net: 0, tax: 0, rates: new Set() },
    B: { net: 0, tax: 0, rates: new Set() },
    C: { net: 0, tax: 0, rates: new Set() },
    D: { net: 0, tax: 0, rates: new Set() },
    E: { net: 0, tax: 0, rates: new Set() },
  }
  const payment: Record<TraPaymentType, number> = {
    CASH: 0,
    CCARD: 0,
    CHEQUE: 0,
    INVOICE: 0,
    EMONEY: 0,
  }
  const fuels: FuelTotals = {
    petrol: { volume: 0, amount: 0, transactionIds: new Set() },
    diesel: { volume: 0, amount: 0, transactionIds: new Set() },
    kerosene: { volume: 0, amount: 0, transactionIds: new Set() },
  }
  const linesByTransaction = new Map<string, DailyLine[]>()
  for (const line of args.lines) {
    const list = linesByTransaction.get(line.transaction_id) ?? []
    list.push(line)
    linesByTransaction.set(line.transaction_id, list)
  }

  let dailyTotalAmount = 0
  let totalStnVolume = 0

  for (const transaction of args.transactions) {
    const amount = Number(transaction.total_amount) || 0
    const transactionVolume = Number(transaction.volume) || 0
    dailyTotalAmount += amount
    payment[normalizeTraPaymentType(transaction.payment_type)] += amount

    const transactionLines = linesByTransaction.get(transaction.id) ?? []
    if (transactionLines.length) {
      let classifiedFuelVolume = 0
      let hasClassifiedFuelLine = false

      for (const line of transactionLines) {
        const quantity = Number(line.quantity) || 0
        const lineGross = quantity * (Number(line.unit_price) || 0)
        const code = requireTanzaniaTaxBucket(line.tax_code)
        const fallback = code === 'A' ? args.defaultVatRatePercent : 0
        addTax(
          taxBuckets[code],
          lineGross,
          normalizeRatePercent(line.tax_rate, fallback),
        )

        const fuel =
          classifyFuelLine(line) ||
          (isFuelCategory(line.category_name)
            ? classifyFuel(transaction)
            : null)
        if (fuel) {
          hasClassifiedFuelLine = true
          classifiedFuelVolume += quantity
          fuels[fuel].amount += lineGross
          fuels[fuel].volume += quantity
          fuels[fuel].transactionIds.add(transaction.id)
        }
      }

      if (hasClassifiedFuelLine) {
        totalStnVolume += classifiedFuelVolume
      } else {
        totalStnVolume += transactionVolume
        const fuel = classifyFuel(transaction)
        if (fuel) {
          fuels[fuel].amount += amount
          fuels[fuel].volume += transactionVolume
          fuels[fuel].transactionIds.add(transaction.id)
        }
      }
    } else {
      totalStnVolume += transactionVolume
      const code = requireTanzaniaTaxBucket(
        transaction.fallback_tax_code ?? 'A',
      )
      const fallback = code === 'A' ? args.defaultVatRatePercent : 0
      addTax(
        taxBuckets[code],
        amount,
        normalizeRatePercent(transaction.fallback_tax_rate, fallback),
      )

      const fuel = classifyFuel(transaction)
      if (fuel) {
        fuels[fuel].amount += amount
        fuels[fuel].volume += transactionVolume
        fuels[fuel].transactionIds.add(transaction.id)
      }
    }
  }

  const unitPrice = (bucket: FuelBucket) =>
    bucket.volume > 0 ? money(bucket.amount / bucket.volume) : 0

  return {
    reportDate: args.businessDate,
    reportTime: args.reportTime,
    zNumber: args.businessDate.replace(/-/g, ''),
    dailyTotalAmount: money(dailyTotalAmount),
    grossTotal: money(args.grossTotal),
    discountsTotal: 0,
    netA: money(taxBuckets.A.net),
    netB: money(taxBuckets.B.net),
    netC: money(taxBuckets.C.net),
    netD: money(taxBuckets.D.net),
    netE: money(taxBuckets.E.net),
    taxA: money(taxBuckets.A.tax),
    taxB: money(taxBuckets.B.tax),
    taxC: money(taxBuckets.C.tax),
    taxD: money(taxBuckets.D.tax),
    taxE: money(taxBuckets.E.tax),
    pmtCash: money(payment.CASH),
    pmtCard: money(payment.CCARD),
    pmtCheque: money(payment.CHEQUE),
    pmtInvoice: money(payment.INVOICE),
    pmtMobile: money(payment.EMONEY),
    ticketsFiscalCount: args.transactions.length,
    ticketsNonFiscal: 0,
    ticketsVoid: 0,
    ticketsVoidTotal: 0,
    vatRateA: uniqueRate(taxBuckets.A, 'A'),
    vatRateB: uniqueRate(taxBuckets.B, 'B'),
    vatRateC: uniqueRate(taxBuckets.C, 'C'),
    vatRateD: uniqueRate(taxBuckets.D, 'D'),
    vatRateE: uniqueRate(taxBuckets.E, 'E'),
    totalStnVolume: volume(totalStnVolume),
    totalPetrol: volume(fuels.petrol.volume),
    totalDiesel: volume(fuels.diesel.volume),
    totalKerosene: volume(fuels.kerosene.volume),
    trnPetrol: fuels.petrol.transactionIds.size,
    trnDiesel: fuels.diesel.transactionIds.size,
    trnKerosene: fuels.kerosene.transactionIds.size,
    unitPricePetrol: unitPrice(fuels.petrol),
    unitPriceDiesel: unitPrice(fuels.diesel),
    unitPriceKerosene: unitPrice(fuels.kerosene),
    petrolTotalAmount: money(fuels.petrol.amount),
    dieselTotalAmount: money(fuels.diesel.amount),
    keroseneTotalAmount: money(fuels.kerosene.amount),
    tanks: args.tanks?.length ? args.tanks : undefined,
  }
}

async function loadTanzaniaDailyTotalTanks(args: {
  stationId: string
  businessDate: string
  timezone: string
}): Promise<TanzaniaDailyTotalTank[]> {
  const rows = await queryAll<DailyTankRow>(
    `SELECT t.id::text AS tank_id,
            t.doms_tank_id,
            t.code AS tank_code,
            t.name AS tank_name,
            p.product_name,
            atg.captured_at,
            atg.volume_litres AS measured_end_volume,
            COALESCE(m.sale_number, 0)::int AS sale_number,
            COALESCE(m.sale_volume, 0)::numeric AS sale_volume,
            COALESCE(m.delivery_volume, 0)::numeric AS delivery_volume
       FROM tanks t
       LEFT JOIN products p
         ON p.station_id = t.station_id
        AND p.id = t.product_id
       LEFT JOIN tank_atg_snapshots atg
         ON atg.station_id = t.station_id
        AND atg.tank_id = t.id
       LEFT JOIN (
         SELECT til.tank_id,
                COUNT(*) FILTER (WHERE til.movement_type = 'DEDUCTION') AS sale_number,
                COALESCE(SUM(til.quantity_litres) FILTER (WHERE til.movement_type = 'DEDUCTION'), 0) AS sale_volume,
                COALESCE(SUM(til.quantity_litres) FILTER (
                  WHERE til.movement_type = 'STOCK_IN'
                    AND til.stock_in_type = 'Delivery'
                ), 0) AS delivery_volume
           FROM tank_inventory_ledger til
          WHERE til.station_id = $1::uuid
            AND (til.effective_at AT TIME ZONE $3)::date = $2::date
          GROUP BY til.tank_id
       ) m ON m.tank_id = t.id
      WHERE t.station_id = $1::uuid
        AND t.status = 'ACTIVE'
      ORDER BY CASE
                 WHEN COALESCE(t.doms_tank_id, t.code, '') ~ '^[0-9]+$'
                   THEN COALESCE(t.doms_tank_id, t.code)::integer
                 ELSE 2147483647
               END,
               COALESCE(t.doms_tank_id, t.code, ''),
               t.id`,
    [args.stationId, args.businessDate, args.timezone],
  )

  if (!rows.length) return []
  const captures = new Set<string>()
  const tanks = rows.map((row) => {
    if (!row.captured_at || row.measured_end_volume == null) {
      throw new Error(
        `Tanzania daily totals require a current ATG reading for tank ${row.tank_name || row.tank_code || row.tank_id}.`,
      )
    }
    captures.add(new Date(row.captured_at).toISOString())
    const tankId = normalizeTanzaniaTankId(row.doms_tank_id ?? row.tank_code)
    if (!tankId) {
      throw new Error(
        `Tanzania daily totals require a DOMS/regulatory Tank_ID for tank ${row.tank_name || row.tank_id}.`,
      )
    }
    const measuredEndVolume = Number(row.measured_end_volume)
    if (!Number.isFinite(measuredEndVolume) || measuredEndVolume < 0) {
      throw new Error(`Tanzania ATG volume is invalid for tank ${tankId}.`)
    }
    return buildTanzaniaDailyTotalTank({
      tankId,
      tankProdName: String(row.product_name ?? row.tank_name ?? '').trim(),
      saleNumber: Number(row.sale_number ?? 0),
      saleVolume: Number(row.sale_volume ?? 0),
      deliveryVolume: Number(row.delivery_volume ?? 0),
      measuredEndVolume,
    })
  })

  if (captures.size !== 1) {
    throw new Error(
      'Tanzania daily totals require all tanks to use the same complete ATG capture; refresh tank gauges before submission.',
    )
  }
  return tanks
}

export async function loadTanzaniaDailyTotalRequest(args: {
  stationId: string
  businessDate: string
}): Promise<TanzaniaDailyTotalRequest> {
  const config = await readTanzaniaFiscalConfig(args.stationId)
  const timezone = config.station.timezone || 'Africa/Dar_es_Salaam'
  const transactions = await queryAll<DailyTransaction>(
    `SELECT t.id::text,
            t.total_amount,
            t.volume,
            t.fuel_type,
            t.grade_name,
            t.payment_type,
            p.product_type_code AS tank_product_type,
            p.product_name AS tank_product_name,
            COALESCE(p.ext_tax_code, p.tax_code, 'A') AS fallback_tax_code,
            p.tax_rate AS fallback_tax_rate
       FROM transactions t
       LEFT JOIN tanks tk
         ON tk.station_id = t.station_id
        AND tk.id = t.tank_id
       LEFT JOIN products p
         ON p.station_id = t.station_id
        AND p.id = tk.product_id
      WHERE t.station_id = $1::uuid
        AND t.deleted_at IS NULL
        AND t.status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED')
        AND (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
      ORDER BY t.transaction_date_time, t.id`,
    [args.stationId, args.businessDate, timezone],
  )
  const lines = transactions.length
    ? await queryAll<DailyLine>(
        `SELECT tl.transaction_id::text,
                tl.quantity,
                tl.unit_price,
                COALESCE(tl.tax_code, p.ext_tax_code, p.tax_code, 'A') AS tax_code,
                COALESCE(tl.tax_rate, p.tax_rate) AS tax_rate,
                p.product_name,
                p.product_type_code,
                COALESCE(pc.name, p.category) AS category_name
           FROM transaction_lines tl
           JOIN transactions t
             ON t.id = tl.transaction_id
            AND t.station_id = $1::uuid
           LEFT JOIN products p
             ON p.id = tl.product_id
            AND p.station_id = t.station_id
           LEFT JOIN product_categories pc
             ON pc.id = p.category_id
            AND pc.station_id = p.station_id
          WHERE t.deleted_at IS NULL
            AND t.status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED')
            AND (t.transaction_date_time AT TIME ZONE $3)::date = $2::date
          ORDER BY tl.created_at, tl.id`,
        [args.stationId, args.businessDate, timezone],
      )
    : []
  const cumulative = await queryOne<{
    opening_gross_total: string | number | null
    local_fiscal_turnover: string | number | null
    opening_gross_total_captured_at: string | Date | null
  }>(
    `SELECT COALESCE(
              (SELECT ss.tanzania_gross_total_opening
                 FROM station_settings ss
                WHERE ss.station_id = $1::uuid),
              0
            ) AS opening_gross_total,
            (SELECT ss.tanzania_gross_total_opening_captured_at
               FROM station_settings ss
              WHERE ss.station_id = $1::uuid) AS opening_gross_total_captured_at,
            COALESCE(SUM(t.total_amount), 0) AS local_fiscal_turnover
       FROM transactions t
      WHERE t.station_id = $1::uuid
        AND t.deleted_at IS NULL
        AND t.status IN ('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED')
        AND (t.transaction_date_time AT TIME ZONE $3)::date <= $2::date`,
    [args.stationId, args.businessDate, timezone],
  )
  if (!cumulative?.opening_gross_total_captured_at) {
    throw new Error(
      'Tanzania opening grossTotal has not been captured. An administrator must save the lifetime opening total (including 0.00 for a new station) before daily totals can be submitted.',
    )
  }

  const tanks = await loadTanzaniaDailyTotalTanks({
    stationId: args.stationId,
    businessDate: args.businessDate,
    timezone,
  })
  const reportTime = dateParts(new Date(), timezone).time
  const vatRate = Number(config.settings.vatRate)
  const defaultVatRatePercent = Number.isFinite(vatRate)
    ? vatRate <= 1
      ? vatRate * 100
      : vatRate
    : 18

  return buildTanzaniaDailyTotalRequest({
    businessDate: args.businessDate,
    reportTime,
    transactions,
    lines,
    grossTotal: calculateTanzaniaGrossTotal(
      cumulative?.opening_gross_total ?? 0,
      cumulative?.local_fiscal_turnover ?? 0,
    ),
    defaultVatRatePercent,
    tanks,
  })
}

export function previousClosedBusinessDate(
  now: Date,
  timezone: string,
): string {
  const today = dateParts(now, timezone).isoDate
  const previous = new Date(`${today}T00:00:00.000Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return previous.toISOString().slice(0, 10)
}
