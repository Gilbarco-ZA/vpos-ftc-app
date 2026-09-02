import { toNumberStrict } from '@/src/shared/numbers'

const parsePayload = (value: unknown): Record<string, any> | null => {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>
  }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null
  } catch {
    return null
  }
}

/**
 * Tanzania receipts/EWURA use the dispenser price captured from DOMS Price_e.
 * Kenya deliberately does not call this helper and retains its existing price
 * calculation/catalogue behaviour.
 */
export const getTanzaniaDomsUnitPrice = (
  transaction: Record<string, any> | null | undefined,
): number | null => {
  const payload = parsePayload(
    transaction?.doms_payload_json ?? transaction?.domsPayloadJson,
  )
  if (!payload) return null

  return toNumberStrict(
    payload.unitPrice ?? payload.unit_price ?? payload.price ?? payload.Price_e,
  )
}
