import { query, queryOne } from '@/src/platform/db/postgres'

export type EwuraResourceType =
  | 'config'
  | 'registration'
  | 'transactions'
  | 'reports'

export type EwuraItemType = Extract<
  EwuraResourceType,
  'transactions' | 'reports'
>

export function parseEwuraResourceType(
  value: string,
): EwuraResourceType | null {
  return value === 'config' ||
    value === 'registration' ||
    value === 'transactions' ||
    value === 'reports'
    ? value
    : null
}

export function parseEwuraItemType(value: string): EwuraItemType | null {
  return value === 'transactions' || value === 'reports' ? value : null
}

export async function getEwuraItem(input: {
  stationId: string
  type: EwuraItemType
  id: string
}) {
  if (input.type === 'transactions') {
    return queryOne<Record<string, unknown>>(
      `SELECT id, station_id, transaction_id, ewura_reference, status, payload_json, created_at, updated_at
         FROM ewura_transactions
        WHERE station_id = $1 AND id = $2`,
      [input.stationId, input.id],
    )
  }
  return queryOne<Record<string, unknown>>(
    `SELECT id, station_id, report_date, ewura_reference, status, payload_json, created_at, updated_at
       FROM ewura_reports
      WHERE station_id = $1 AND id = $2`,
    [input.stationId, input.id],
  )
}

export async function getEwuraResources(input: {
  stationId: string
  type: EwuraResourceType
  status?: string | null
  limit: number
}) {
  if (input.type === 'config') {
    return queryOne<Record<string, unknown>>(
      `SELECT station_id, config_json, created_at, updated_at
         FROM ewura_config
        WHERE station_id = $1`,
      [input.stationId],
    )
  }
  if (input.type === 'registration') {
    return queryOne<Record<string, unknown>>(
      `SELECT station_id, status, registration_json, registered_at, created_at, updated_at
         FROM ewura_registration
        WHERE station_id = $1`,
      [input.stationId],
    )
  }
  if (input.type === 'transactions') {
    const result = await query<Record<string, unknown>>(
      `SELECT id, station_id, transaction_id, ewura_reference, status, payload_json, created_at, updated_at
         FROM ewura_transactions
        WHERE station_id = $1
          AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC
        LIMIT $3`,
      [input.stationId, input.status ?? null, input.limit],
    )
    return result.rows ?? []
  }
  const result = await query<Record<string, unknown>>(
    `SELECT id, station_id, report_date, ewura_reference, status, payload_json, created_at, updated_at
       FROM ewura_reports
      WHERE station_id = $1
        AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3`,
    [input.stationId, input.status ?? null, input.limit],
  )
  return result.rows ?? []
}

type SaveEwuraResult = { ok: true; id?: string } | { ok: false; error: string }

export async function saveEwuraResource(input: {
  stationId: string
  type: EwuraResourceType
  body: Record<string, any>
}): Promise<SaveEwuraResult> {
  const { stationId, type, body } = input
  if (type === 'config') {
    const configJson = body.configJson ?? body.config_json ?? body.json
    if (configJson == null)
      return { ok: false, error: 'configJson is required' }
    await query(
      `INSERT INTO ewura_config (station_id, config_json)
            VALUES ($1, $2)
       ON CONFLICT (station_id)
       DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
      [stationId, configJson],
    )
    return { ok: true }
  }

  if (type === 'registration') {
    const registrationJson =
      body.registrationJson ?? body.registration_json ?? body.json
    if (registrationJson == null) {
      return { ok: false, error: 'registrationJson is required' }
    }
    await query(
      `INSERT INTO ewura_registration (station_id, status, registration_json, registered_at)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (station_id)
       DO UPDATE SET status = EXCLUDED.status,
                     registration_json = EXCLUDED.registration_json,
                     registered_at = EXCLUDED.registered_at,
                     updated_at = NOW()`,
      [
        stationId,
        body.status ?? 'UNKNOWN',
        registrationJson,
        body.registeredAt ?? body.registered_at ?? null,
      ],
    )
    return { ok: true }
  }

  if (type === 'transactions') {
    const id = body.id ?? null
    const transactionId = body.transactionId ?? body.transaction_id ?? null
    const payloadJson =
      body.payloadJson ?? body.payload_json ?? body.json ?? null
    if (!id) {
      if (!transactionId)
        return { ok: false, error: 'transactionId is required' }
      if (payloadJson == null)
        return { ok: false, error: 'payloadJson is required' }
      const row = await queryOne<{ id: string }>(
        `INSERT INTO ewura_transactions (station_id, transaction_id, ewura_reference, status, payload_json)
              VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
        [
          stationId,
          transactionId,
          body.ewuraReference ?? body.ewura_reference ?? null,
          body.status ?? 'NEW',
          payloadJson,
        ],
      )
      return { ok: true, id: row?.id }
    }
    await query(
      `UPDATE ewura_transactions
          SET transaction_id = COALESCE($3, transaction_id),
              ewura_reference = COALESCE($4, ewura_reference),
              status = COALESCE($5, status),
              payload_json = COALESCE($6, payload_json),
              updated_at = NOW()
        WHERE station_id = $1 AND id = $2`,
      [
        stationId,
        id,
        transactionId,
        body.ewuraReference ?? body.ewura_reference ?? null,
        body.status ?? null,
        payloadJson,
      ],
    )
    return { ok: true }
  }

  const id = body.id ?? null
  const reportDate = body.reportDate ?? body.report_date ?? null
  const payloadJson = body.payloadJson ?? body.payload_json ?? body.json ?? null
  if (!id) {
    if (!reportDate) return { ok: false, error: 'reportDate is required' }
    if (payloadJson == null)
      return { ok: false, error: 'payloadJson is required' }
    const row = await queryOne<{ id: string }>(
      `INSERT INTO ewura_reports (station_id, report_date, ewura_reference, status, payload_json)
            VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
      [
        stationId,
        reportDate,
        body.ewuraReference ?? body.ewura_reference ?? null,
        body.status ?? 'NEW',
        payloadJson,
      ],
    )
    return { ok: true, id: row?.id }
  }
  await query(
    `UPDATE ewura_reports
        SET report_date = COALESCE($3, report_date),
            ewura_reference = COALESCE($4, ewura_reference),
            status = COALESCE($5, status),
            payload_json = COALESCE($6, payload_json),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [
      stationId,
      id,
      reportDate,
      body.ewuraReference ?? body.ewura_reference ?? null,
      body.status ?? null,
      payloadJson,
    ],
  )
  return { ok: true }
}
