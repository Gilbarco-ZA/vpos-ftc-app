import { queryOne, txQuery, withTransaction } from '@/src/platform/db/postgres'

export type TanzaniaReceiptCounters = {
  receiptNo: number
  globalCount: number
  dailyCount: number
  znum: string
}

function asPositiveInt(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

export async function getExistingReceiptCounters(args: {
  stationId: string
  transactionId: string
}): Promise<TanzaniaReceiptCounters | null> {
  const row = await queryOne<any>(
    `SELECT request_payload
       FROM fiscalization_events
      WHERE station_id = $1
        AND transaction_id = $2
        AND engine = 'TZ'
        AND request_payload ? 'tra'
      ORDER BY occurred_at DESC
      LIMIT 1`,
    [args.stationId, args.transactionId],
  )

  const traRoot =
    row?.request_payload?.tra ?? row?.request_payload?.request?.tra
  const tra = traRoot?.tra ?? traRoot
  const receiptNo = asPositiveInt(tra?.receiptNo)
  const globalCount = asPositiveInt(tra?.globalCount)
  const dailyCount = asPositiveInt(tra?.dailyCount)
  const znum = String(tra?.znum ?? '').trim()

  if (!receiptNo || !globalCount || !dailyCount || !znum) return null
  return { receiptNo, globalCount, dailyCount, znum }
}

export async function allocateReceiptCounters(args: {
  stationId: string
  transactionId: string
  znum: string
}): Promise<TanzaniaReceiptCounters> {
  const existing = await getExistingReceiptCounters(args)
  if (existing) return existing

  return await allocateFreshReceiptCounters(args)
}

export async function allocateFreshReceiptCounters(args: {
  stationId: string
  znum: string
}): Promise<TanzaniaReceiptCounters> {
  return await withTransaction(async (client) => {
    const global = await txQuery<any>(
      client,
      `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
       VALUES ($1, 'receipt:global', 1)
       ON CONFLICT (station_id, counter_key)
       DO UPDATE SET counter_value = tanzania_fiscal_counters.counter_value + 1,
                     updated_at = NOW()
       RETURNING counter_value`,
      [args.stationId],
    )

    const daily = await txQuery<any>(
      client,
      `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
       VALUES ($1, $2, 1)
       ON CONFLICT (station_id, counter_key)
       DO UPDATE SET counter_value = tanzania_fiscal_counters.counter_value + 1,
                     updated_at = NOW()
       RETURNING counter_value`,
      [args.stationId, `receipt:${args.znum}`],
    )

    const globalCount = Number(global.rows?.[0]?.counter_value ?? 1)
    const dailyCount = Number(daily.rows?.[0]?.counter_value ?? 1)

    return {
      receiptNo: globalCount,
      globalCount,
      dailyCount,
      znum: args.znum,
    }
  })
}

export async function allocateReportCounter(args: {
  stationId: string
  reportKey: string
}): Promise<number> {
  return await withTransaction(async (client) => {
    const res = await txQuery<any>(
      client,
      `INSERT INTO tanzania_fiscal_counters (station_id, counter_key, counter_value)
       VALUES ($1, $2, 1)
       ON CONFLICT (station_id, counter_key)
       DO UPDATE SET counter_value = tanzania_fiscal_counters.counter_value + 1,
                     updated_at = NOW()
       RETURNING counter_value`,
      [args.stationId, `report:${args.reportKey}`],
    )
    return Number(res.rows?.[0]?.counter_value ?? 1)
  })
}
