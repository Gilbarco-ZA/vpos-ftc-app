import { kvGet, kvSet } from '@/src/shared/storage/stationKv'

export type RuntimeState = {
  status: 'IDLE' | 'RUNNING' | 'ERROR' | 'RESTARTING'
  updatedAt: string
  message?: string
}

function nowIso() {
  return new Date().toISOString()
}

export async function getRuntimeState(
  stationId: string,
): Promise<RuntimeState> {
  const s = await kvGet<RuntimeState>(stationId, 'vpos.runtime.state')
  return (
    s ?? {
      status: 'IDLE',
      updatedAt: nowIso(),
    }
  )
}

export async function setRuntimeState(
  stationId: string,
  patch: Partial<RuntimeState>,
) {
  const current = await getRuntimeState(stationId)
  const next: RuntimeState = {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  }
  await kvSet(stationId, 'vpos.runtime.state', next)
  return next
}

export async function getDailyData(stationId: string) {
  return (await kvGet<any>(stationId, 'vpos.runtime.daily')) ?? {}
}

export async function setDailyData(stationId: string, data: any) {
  await kvSet(stationId, 'vpos.runtime.daily', data ?? {})
}

export async function captureCustomerDetails(stationId: string, details: any) {
  await kvSet(stationId, 'vpos.customer.current', details ?? {})
}

export async function clearCustomerDetails(stationId: string) {
  await kvSet(stationId, 'vpos.customer.current', null)
}

export async function getCustomerDetails(stationId: string) {
  return await kvGet<any>(stationId, 'vpos.customer.current')
}
