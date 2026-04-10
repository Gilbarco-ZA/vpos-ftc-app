import type {
  BulkManageFiscalInboxAction,
  FiscalInboxDetailRow,
  FiscalInboxListFilters,
  FiscalInboxMetrics,
  FiscalInboxQueueRow,
  FiscalInboxRepositoryPort,
  FiscalInboxStatusSnapshot,
} from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'

import { query } from '@/src/platform/db/postgres/query'

import { normalizeFiscalInboxStatus } from '@/src/modules/fiscal-inbox/domain/fiscal-inbox-status'
import { mapFiscalInboxListItem } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.mapper'
import {
  fiscalInboxListCountSql,
  fiscalInboxListRowsSql,
  fiscalInboxSql,
} from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.sql'

function asPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

function asNonNegativeInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback
}

function applyStationFilter(baseSql: string, stationId?: string | null) {
  return stationId ? `${baseSql} AND station_id = $2::text` : baseSql
}

export function createFiscalInboxRepository(): FiscalInboxRepositoryPort {
  return {
    async list(filters: FiscalInboxListFilters) {
      const stationId = String(filters.stationId || '').trim()
      if (!stationId) throw new Error('stationId is required')

      const limit = Math.max(1, Math.min(500, asPositiveInt(filters.limit, 50)))
      const offset = Math.max(0, asNonNegativeInt(filters.offset, 0))

      const countWhere: string[] = ['station_id::text = $1::text']
      const listWhere: string[] = ['fi.station_id::text = $1::text']
      const params: unknown[] = [stationId]

      const status = filters.status ?? 'ANY'
      if (status && status !== 'ANY') {
        params.push(status)
        countWhere.push(`status = $${params.length}`)
        listWhere.push(`fi.status = $${params.length}`)
      }

      const topic = filters.topic ?? 'ANY'
      if (topic && topic !== 'ANY') {
        params.push(topic)
        countWhere.push(`topic = $${params.length}`)
        listWhere.push(`fi.topic = $${params.length}`)
      }

      const countWhereSql = `WHERE ${countWhere.join(' AND ')}`
      const listWhereSql = `WHERE ${listWhere.join(' AND ')}`

      const totalRes = await query<{ cnt: string }>(
        fiscalInboxListCountSql(countWhereSql),
        params,
      )
      const total = Number(totalRes.rows?.[0]?.cnt ?? 0)

      const listParams = [...params, limit, offset]
      const res = await query(
        fiscalInboxListRowsSql(
          listWhereSql,
          listParams.length - 1,
          listParams.length,
        ),
        listParams,
      )

      return {
        total,
        limit,
        offset,
        items: (res.rows ?? []).map((row) => mapFiscalInboxListItem(row)),
      }
    },

    async getById(id: number, stationId: string) {
      const res = await query<FiscalInboxDetailRow>(fiscalInboxSql.getById, [
        id,
        stationId,
      ])
      return (res.rows?.[0] ?? null) as FiscalInboxDetailRow | null
    },

    async findByRequestId(requestId: string, stationId?: string | null) {
      const res = await query(fiscalInboxSql.findByRequestId, [
        requestId,
        stationId ?? null,
      ])
      return (res.rows ?? []) as Record<string, unknown>[]
    },

    async getNewestByRequestId(requestId: string, stationId?: string | null) {
      const res = await query(fiscalInboxSql.getNewestByRequestId, [
        requestId,
        stationId ?? null,
      ])
      return (res.rows?.[0] ?? null) as Record<string, unknown> | null
    },

    async getStatusSnapshot(input: { id: number; stationId: string }) {
      const res = await query(fiscalInboxSql.getStatusSnapshot, [
        input.id,
        input.stationId,
      ])
      const row = res.rows?.[0]
      if (!row) return null

      return {
        id: Number((row as any).id),
        stationId: String((row as any).station_id ?? input.stationId),
        status: normalizeFiscalInboxStatus((row as any).status),
        requestId: (row as any).request_id
          ? String((row as any).request_id)
          : null,
      } as FiscalInboxStatusSnapshot
    },

    async requeueById(input: { id: number; stationId: string }) {
      const res = await query<{ id: number | string }>(
        fiscalInboxSql.requeueById,
        [input.id, input.stationId],
      )
      return Number(res.rows?.[0]?.id ?? 0) || null
    },

    async markFailedById(input: {
      id: number
      stationId: string
      errorText: string
    }) {
      const res = await query<{ id: number | string }>(
        fiscalInboxSql.markFailedById,
        [input.id, input.stationId, input.errorText],
      )
      return Number(res.rows?.[0]?.id ?? 0) || null
    },

    async markDeadById(input: {
      id: number
      stationId: string
      errorText: string
    }) {
      const res = await query<{ id: number | string }>(
        fiscalInboxSql.markDeadById,
        [input.id, input.stationId, input.errorText],
      )
      return Number(res.rows?.[0]?.id ?? 0) || null
    },

    async markProcessedById(input: { id: number; stationId: string }) {
      const res = await query<{ id: number | string }>(
        fiscalInboxSql.markProcessedById,
        [input.id, input.stationId],
      )
      return Number(res.rows?.[0]?.id ?? 0) || null
    },

    async deleteById(input: { id: number; stationId: string }) {
      const res = await query<{ id: number | string }>(
        fiscalInboxSql.deleteById,
        [input.id, input.stationId],
      )
      return Number(res.rows?.[0]?.id ?? 0) || null
    },

    async cloneAndRequeue(input: {
      id: number
      stationId: string
      requestId?: string | null
      messageJson?: unknown
    }) {
      const srcRes = await query(fiscalInboxSql.cloneSourceById, [
        input.id,
        input.stationId,
      ])
      const src = srcRes.rows?.[0] as any
      if (!src) return null

      const insertRes = await query<{ id: number | string }>(
        fiscalInboxSql.cloneInsert,
        [
          input.stationId,
          src.topic,
          input.requestId != null ? input.requestId : src.request_id,
          input.messageJson != null ? input.messageJson : src.message_json,
        ],
      )
      return Number(insertRes.rows?.[0]?.id ?? 0) || null
    },

    async exportRows(ids: number[], stationId?: string | null) {
      const res = await query(
        `SELECT *
           FROM fiscal_inbox
          WHERE id = ANY($1::bigint[])
            AND ($2::text IS NULL OR station_id = $2::text)
          ORDER BY id ASC`,
        [ids, stationId ?? null],
      )
      return (res.rows ?? []) as Record<string, unknown>[]
    },

    async exportRowsMetadata(ids: number[], stationId?: string | null) {
      const res = await query(
        `SELECT id, station_id, topic, status, request_id, attempt_count, next_attempt_at, received_at, processed_at, dead_at, error_text
           FROM fiscal_inbox
          WHERE id = ANY($1::bigint[])
            AND ($2::text IS NULL OR station_id = $2::text)
          ORDER BY id ASC`,
        [ids, stationId ?? null],
      )
      return (res.rows ?? []) as Record<string, unknown>[]
    },

    async bulkUpdate(input: {
      ids: number[]
      stationId?: string | null
      action: BulkManageFiscalInboxAction
      errorText?: string | null
    }) {
      const stationFilter = input.stationId ? 'AND station_id = $2::text' : ''
      const argsBase: unknown[] = [input.ids]
      if (input.stationId) argsBase.push(input.stationId)

      if (input.action === 'REQUEUE') {
        await query(
          `UPDATE fiscal_inbox
              SET status='PENDING', attempt_count=0, next_attempt_at=NOW(), dead_at=NULL, processed_at=NULL, error_text=NULL
            WHERE id = ANY($1::bigint[]) ${stationFilter}`,
          argsBase,
        )
        return { ok: true as const }
      }

      if (input.action === 'MARK_FAILED') {
        const qargs = [...argsBase, input.errorText ?? null]
        await query(
          `UPDATE fiscal_inbox
              SET status='FAILED', next_attempt_at=NOW(), error_text = COALESCE($${qargs.length}::text, error_text)
            WHERE id = ANY($1::bigint[]) ${stationFilter}`,
          qargs,
        )
        return { ok: true as const }
      }

      if (input.action === 'MARK_DEAD') {
        const qargs = [...argsBase, input.errorText ?? null]
        await query(
          `UPDATE fiscal_inbox
              SET status='DEAD', dead_at=NOW(), error_text = COALESCE($${qargs.length}::text, error_text)
            WHERE id = ANY($1::bigint[]) ${stationFilter}`,
          qargs,
        )
        return { ok: true as const }
      }

      if (input.action === 'MARK_PROCESSED') {
        await query(
          `UPDATE fiscal_inbox
              SET status='PROCESSED', processed_at=NOW()
            WHERE id = ANY($1::bigint[]) ${stationFilter}`,
          argsBase,
        )
        return { ok: true as const }
      }

      await query(
        `DELETE FROM fiscal_inbox
          WHERE id = ANY($1::bigint[]) ${stationFilter}`,
        argsBase,
      )
      return { ok: true as const }
    },

    async bulkCloneAndRequeue(input: {
      ids: number[]
      stationId?: string | null
      requestIdSuffix?: string
      override?: {
        merge?: Record<string, unknown>
        replace?: Record<string, unknown>
      }
    }) {
      const sourceRows = await query<any>(
        `SELECT id, station_id, topic, request_id, message_json
           FROM fiscal_inbox
          WHERE id = ANY($1::bigint[])
            AND ($2::text IS NULL OR station_id = $2::text)
          ORDER BY id ASC`,
        [input.ids, input.stationId ?? null],
      )

      const created: Record<string, unknown>[] = []
      for (const row of sourceRows.rows ?? []) {
        const baseMsg = row.message_json ?? {}
        const replace = input.override?.replace ?? null
        const merge = input.override?.merge ?? null
        const msg = replace
          ? replace
          : merge
            ? { ...(baseMsg || {}), ...merge }
            : baseMsg
        const newRequestId = row.request_id
          ? String(row.request_id) + String(input.requestIdSuffix ?? '')
          : null

        const inserted = await query<any>(
          `INSERT INTO fiscal_inbox (station_id, topic, request_id, message_json, status, attempt_count, next_attempt_at, dead_at)
           VALUES ($1, $2, $3, $4::jsonb, 'PENDING', 0, NOW(), NULL)
           RETURNING id, station_id, topic, request_id, status, received_at`,
          [row.station_id, row.topic, newRequestId, JSON.stringify(msg)],
        )
        if (inserted.rows?.[0]) created.push(inserted.rows[0])
      }

      return { createdCount: created.length, created }
    },

    async requeueDead(input: { stationId: string; ids?: number[] | null }) {
      const res = await query(
        input.ids && input.ids.length
          ? `UPDATE fiscal_inbox
                SET status = 'PENDING',
                    attempt_count = 0,
                    next_attempt_at = NOW(),
                    dead_at = NULL,
                    error_text = NULL,
                    updated_at = NOW()
              WHERE station_id = $1
                AND status = 'DEAD'
                AND id = ANY($2::bigint[])
              RETURNING id`
          : `UPDATE fiscal_inbox
                SET status = 'PENDING',
                    attempt_count = 0,
                    next_attempt_at = NOW(),
                    dead_at = NULL,
                    error_text = NULL,
                    updated_at = NOW()
              WHERE station_id = $1
                AND status = 'DEAD'
              RETURNING id`,
        input.ids && input.ids.length
          ? [input.stationId, input.ids]
          : [input.stationId],
      )

      const requeued = (res.rows ?? []).map((row: any) => Number(row.id))
      return { requeuedCount: requeued.length, requeuedIds: requeued }
    },

    async enqueue(input: {
      stationId: string
      topic: 'fiscal' | 'pos' | 'external_fiscalization'
      requestId?: string | null
      message: unknown
    }) {
      const res = await query<{ id: number | string }>(fiscalInboxSql.enqueue, [
        input.stationId,
        input.topic,
        input.requestId != null ? String(input.requestId) : null,
        input.message ?? null,
      ])
      return Number(res.rows?.[0]?.id ?? 0) || null
    },

    async claimBatch(limit: number) {
      const res = await query<FiscalInboxQueueRow>(fiscalInboxSql.claimBatch, [
        limit,
      ])
      return (res.rows ?? []) as FiscalInboxQueueRow[]
    },

    async markDeliveryFailed(input: {
      id: number
      errorText: string
      maxAttempts?: number
    }) {
      await query(fiscalInboxSql.markDeliveryFailed, [
        input.id,
        input.errorText,
        Math.max(1, Number(input.maxAttempts ?? 10)),
      ])
    },

    async getMetricsByStation(stationId: string) {
      const res = await query(fiscalInboxSql.metricsByStation, [stationId])
      const row = res.rows?.[0] as any
      if (!row) return null

      return {
        ready: Number(row.ready ?? 0),
        processing: Number(row.processing ?? 0),
        dead: Number(row.dead ?? 0),
        oldestReadyAt: row.oldest_ready_at ? String(row.oldest_ready_at) : null,
        oldestDeadAt: row.oldest_dead_at ? String(row.oldest_dead_at) : null,
      } as FiscalInboxMetrics
    },
  }
}

export const fiscalInboxRepository = createFiscalInboxRepository()
