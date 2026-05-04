import type { SessionUser } from '@/src/shared/types'
import { NextRequest, NextResponse } from "next/server";

import { query, queryOne } from '@/src/platform/db/postgres'
import { readBody } from '@/src/platform/web/api/request'
import { fail, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type EwuraType = 'config' | 'registration' | 'transactions' | 'reports'

const asType = (t: string): EwuraType | null => {
  if (
    t === 'config' ||
    t === 'registration' ||
    t === 'transactions' ||
    t === 'reports'
  )
    return t
  return null
}

export const GET = async (req: NextRequest, props: { params: Promise<{ type: string }> }) => {
  const params = await props.params;
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    const type = asType(params.type)
    if (!type) return fail('Invalid EWURA resource type', 400)

    const stationId = user?.stationId
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const limit = Math.min(
      Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1),
      500,
    )

    if (type === 'config') {
      const row = await queryOne<any>(
        `SELECT station_id, config_json, created_at, updated_at
           FROM ewura_config
          WHERE station_id = $1`,
        [stationId],
      )
      return NextResponse.json({ ok: true, data: row ?? null })
    }

    if (type === 'registration') {
      const row = await queryOne<any>(
        `SELECT station_id, status, registration_json, registered_at, created_at, updated_at
           FROM ewura_registration
          WHERE station_id = $1`,
        [stationId],
      )
      return NextResponse.json({ ok: true, data: row ?? null })
    }

    if (type === 'transactions') {
      const rows = await query<any>(
        `SELECT id, station_id, transaction_id, ewura_reference, status, payload_json, created_at, updated_at
           FROM ewura_transactions
          WHERE station_id = $1
            AND ($2::text IS NULL OR status = $2)
          ORDER BY created_at DESC
          LIMIT $3`,
        [stationId, status, limit],
      )
      return NextResponse.json({ ok: true, data: rows ?? [] })
    }

    // reports
    const rows = await query<any>(
      `SELECT id, station_id, report_date, ewura_reference, status, payload_json, created_at, updated_at
         FROM ewura_reports
        WHERE station_id = $1
          AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC
        LIMIT $3`,
      [stationId, status, limit],
    )
    return NextResponse.json({ ok: true, data: rows ?? [] })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
export const POST = async (req: NextRequest, props: { params: Promise<{ type: string }> }) => {
  const params = await props.params;
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const body = await readBody(req)
    const type = asType(params.type)
    if (!type) return fail('Invalid EWURA resource type', 400)
    const stationId = user?.stationId

    if (type === 'config') {
      const configJson = body?.configJson ?? body?.config_json ?? body?.json
      if (configJson == null) return fail('configJson is required', 400)
      await query(
        `INSERT INTO ewura_config (station_id, config_json)
              VALUES ($1, $2)
         ON CONFLICT (station_id)
         DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
        [stationId, configJson],
      )
      return NextResponse.json({ ok: true })
    }

    if (type === 'registration') {
      const registrationJson =
        body?.registrationJson ?? body?.registration_json ?? body?.json
      const status = body?.status ?? 'UNKNOWN'
      const registeredAt = body?.registeredAt ?? body?.registered_at ?? null
      if (registrationJson == null)
        return fail('registrationJson is required', 400)
      await query(
        `INSERT INTO ewura_registration (station_id, status, registration_json, registered_at)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (station_id)
         DO UPDATE SET status = EXCLUDED.status,
                       registration_json = EXCLUDED.registration_json,
                       registered_at = EXCLUDED.registered_at,
                       updated_at = NOW()`,
        [stationId, status, registrationJson, registeredAt],
      )
      return NextResponse.json({ ok: true })
    }

    if (type === 'transactions') {
      const id = body?.id ?? null
      const transactionId = body?.transactionId ?? body?.transaction_id ?? null
      const ewuraReference =
        body?.ewuraReference ?? body?.ewura_reference ?? null
      const status = body?.status ?? null
      const payloadJson =
        body?.payloadJson ?? body?.payload_json ?? body?.json ?? null

      if (!id) {
        if (!transactionId) return fail('transactionId is required', 400)
        if (payloadJson == null) return fail('payloadJson is required', 400)
        const row = await queryOne<any>(
          `INSERT INTO ewura_transactions (station_id, transaction_id, ewura_reference, status, payload_json)
                VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
          [
            stationId,
            transactionId,
            ewuraReference,
            status ?? 'NEW',
            payloadJson,
          ],
        )
        return NextResponse.json({ ok: true, id: row?.id })
      }

      await query(
        `UPDATE ewura_transactions
            SET transaction_id = COALESCE($3, transaction_id),
                ewura_reference = COALESCE($4, ewura_reference),
                status = COALESCE($5, status),
                payload_json = COALESCE($6, payload_json),
                updated_at = NOW()
          WHERE station_id = $1 AND id = $2`,
        [stationId, id, transactionId, ewuraReference, status, payloadJson],
      )
      return NextResponse.json({ ok: true })
    }

    // reports
    {
      const id = body?.id ?? null
      const reportDate = body?.reportDate ?? body?.report_date ?? null
      const ewuraReference =
        body?.ewuraReference ?? body?.ewura_reference ?? null
      const status = body?.status ?? null
      const payloadJson =
        body?.payloadJson ?? body?.payload_json ?? body?.json ?? null

      if (!id) {
        if (!reportDate) return fail('reportDate is required', 400)
        if (payloadJson == null) return fail('payloadJson is required', 400)
        const row = await queryOne<any>(
          `INSERT INTO ewura_reports (station_id, report_date, ewura_reference, status, payload_json)
                VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
          [stationId, reportDate, ewuraReference, status ?? 'NEW', payloadJson],
        )
        return NextResponse.json({ ok: true, id: row?.id })
      }

      await query(
        `UPDATE ewura_reports
            SET report_date = COALESCE($3, report_date),
                ewura_reference = COALESCE($4, ewura_reference),
                status = COALESCE($5, status),
                payload_json = COALESCE($6, payload_json),
                updated_at = NOW()
          WHERE station_id = $1 AND id = $2`,
        [stationId, id, reportDate, ewuraReference, status, payloadJson],
      )
      return NextResponse.json({ ok: true })
    }
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
