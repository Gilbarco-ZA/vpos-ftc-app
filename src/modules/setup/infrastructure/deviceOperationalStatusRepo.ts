import { queryOne } from '@/src/platform/db/postgres'

export type LatestProxyFiscalizationSignal = {
  status: string | null
  errorMessage: string | null
  responsePayload: unknown
  occurredAt: string | Date | null
}

export async function getLatestProxyFiscalizationSignal(
  stationId: string,
): Promise<LatestProxyFiscalizationSignal | null> {
  return await queryOne<LatestProxyFiscalizationSignal>(
    `SELECT status,
            error_message AS "errorMessage",
            response_payload AS "responsePayload",
            occurred_at AS "occurredAt"
       FROM fiscalization_events
      WHERE station_id = $1::uuid
        AND transport = 'proxy'
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT 1`,
    [stationId],
  )
}
