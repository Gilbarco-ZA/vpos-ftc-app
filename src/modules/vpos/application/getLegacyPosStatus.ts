import { legacyJson, sendPosCommand } from '@/src/shared/vpos/legacyCompat'

export async function getLegacyPosStatus(stationId: string) {
  try {
    const res = await sendPosCommand(stationId, { type: 'POS_STATUS' } as any)
    const payload =
      (res as any)?.ok && (res as any)?.data !== undefined
        ? (res as any).data
        : res
    const status = (res as any)?.ok === false ? 502 : undefined
    return legacyJson(payload, status ? { status } : undefined)
  } catch (error: any) {
    return legacyJson(
      {
        ok: false,
        error: String(error?.message ?? error ?? 'POS status request failed'),
        code: error?.code ?? 'POS_STATUS_FAILED',
      },
      { status: typeof error?.status === 'number' ? error.status : 502 },
    )
  }
}
