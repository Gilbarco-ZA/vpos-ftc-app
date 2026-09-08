import { proxyRequest } from '@/src/shared/proxy/client'

import { normalizeTanzaniaRegisteredReceiptCode } from '../domain/receiptVerificationPrefix'

export function extractRegisteredReceiptCode(value: unknown): string | null {
  const payload =
    value && typeof value === 'object' ? ((value as any)?.data ?? value) : null
  if (!payload || typeof payload !== 'object') return null

  return normalizeTanzaniaRegisteredReceiptCode(
    (payload as any).receiptCode ?? (payload as any).receipt_code,
  )
}

export async function getRegisteredTanzaniaReceiptCode(
  stationId: string,
): Promise<string | null> {
  try {
    const response = await proxyRequest(stationId, {
      method: 'GET',
      path: '/api/tanzania/registrations/tra/status',
      fallbackPath: '/api/tanzania/registrations/tra/status',
    })
    if (!response.ok) return null
    return extractRegisteredReceiptCode(response.data)
  } catch {
    return null
  }
}
