import { createHash } from 'node:crypto'

import { query } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/ids'

export type ForecourtPriceScheduleEventType =
  | 'submitted_local'
  | 'verification_unavailable'
  | 'confirmed_on_doms'
  | 'activated_on_doms'
  | 'removed_from_pending_queue'

const stableClone = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => stableClone(item))
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableClone((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

const stableStringify = (value: unknown) =>
  JSON.stringify(stableClone(value ?? {}))

const sha256Hex = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex')

export async function appendForecourtPriceScheduleEvent(params: {
  stationId: string
  priceSetId: number
  activationAt: string
  eventType: ForecourtPriceScheduleEventType
  source?: string
  submittedBy?: string | null
  domsConfirmationStatus?: string | null
  payload?: unknown
  data?: unknown
}) {
  const payloadBody = params.payload ?? params.data ?? {}
  const payloadJson = stableStringify(payloadBody)
  const data =
    params.data && typeof params.data === 'object'
      ? {
          ...(params.data as Record<string, unknown>),
          payloadSha256: sha256Hex(payloadJson),
        }
      : {
          value: params.data ?? null,
          payloadSha256: sha256Hex(payloadJson),
        }

  await query(
    `INSERT INTO forecourt_price_schedule_events
       (
         id,
         station_id,
         price_set_id,
         activation_at,
         event_type,
         source,
         submitted_by,
         doms_confirmation_status,
         payload_sha256,
         data
       )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      uuidv4(),
      params.stationId,
      params.priceSetId,
      params.activationAt,
      params.eventType,
      params.source ?? 'local',
      params.submittedBy ?? null,
      params.domsConfirmationStatus ?? null,
      sha256Hex(payloadJson),
      data,
    ],
  )
}
