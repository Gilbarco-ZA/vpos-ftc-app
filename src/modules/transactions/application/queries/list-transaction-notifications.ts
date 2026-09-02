import { query } from '@/src/platform/db/postgres'

export async function listTransactionNotifications(input: {
  stationId: string
  sinceId: number
  limit: number
}) {
  const rows = await query(
    `
      SELECT id, received_at, message_json
      FROM fiscal_inbox
      WHERE station_id = $1
        AND id > $2
        AND (message_json->>'type') IN (
          'transactionCreated',
          'transactionFailed',
          'transactionFiscalized'
        )
      ORDER BY id ASC
      LIMIT $3
    `,
    [input.stationId, input.sinceId, input.limit],
  )
  return (rows?.rows ?? []).map((row: any) => {
    const message = row.message_json ?? {}
    return {
      id: Number(row.id),
      receivedAt: row.received_at ? String(row.received_at) : null,
      type: String(message.type || ''),
      transactionId: message.transactionId ?? null,
      pumpNumber: message.pumpNumber ?? null,
      amount: message.amount ?? null,
      error: message.error ?? null,
      reference: message.reference ?? null,
    }
  })
}
