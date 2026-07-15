import { listTransactionsCsvRows } from '@/src/modules/reports/infrastructure/reportsRepo'

function escapeCsv(value: unknown) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportTransactionsCsv(
  stationId: string,
  startDate?: string | null,
  endDate?: string | null,
) {
  const rows = await listTransactionsCsvRows(
    stationId,
    startDate ?? null,
    endDate ?? null,
  )
  const headers = [
    'id',
    'transaction_date_time',
    'pos_reference',
    'pump_number',
    'fuel_type',
    'volume',
    'total_amount',
    'status',
    'fiscalization_reference',
  ]
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv((row as any)[h])).join(','))
  }
  return lines.join('\n')
}
