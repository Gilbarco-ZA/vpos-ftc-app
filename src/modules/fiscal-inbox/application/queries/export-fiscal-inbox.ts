import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

function csvEscape(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function exportFilename(ext: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `fiscal_inbox_export_${ts}.${ext}`
}

export async function exportFiscalInboxQuery(args: {
  ids: number[]
  stationId?: string | null
  format: 'json' | 'csv' | 'ndjson'
}) {
  if (args.format === 'csv') {
    const rows = await fiscalInboxRepository.exportRowsMetadata(
      args.ids,
      args.stationId,
    )
    const header = [
      'id',
      'station_id',
      'topic',
      'status',
      'request_id',
      'attempt_count',
      'next_attempt_at',
      'received_at',
      'processed_at',
      'dead_at',
      'error_text',
    ]
    const out = [header.join(',')]
    for (const row of rows) {
      out.push(header.map((key) => csvEscape((row as any)[key])).join(','))
    }
    const csv = `${out.join('\n')}\n`
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${exportFilename('csv')}"`,
      },
    })
  }

  if (args.format === 'ndjson') {
    const rows = await fiscalInboxRepository.exportRows(
      args.ids,
      args.stationId,
    )
    const ndjson = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    return new Response(ndjson, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="${exportFilename('ndjson')}"`,
      },
    })
  }

  const rows = await fiscalInboxRepository.exportRows(args.ids, args.stationId)
  const payload = JSON.stringify(
    { exportedAt: new Date().toISOString(), count: rows.length, items: rows },
    null,
    2,
  )
  return new Response(payload, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFilename('json')}"`,
    },
  })
}
