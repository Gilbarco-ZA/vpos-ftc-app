export const TANZANIA_CUSTOMER_ID_TYPES = {
  TIN: '1',
  DRIVING_LICENSE: '2',
  VOTERS_NUMBER: '3',
  PASSPORT: '4',
  NID: '5',
  NIL: '6',
  METER_NUMBER: '7',
} as const

export type TanzaniaCustomerIdentity = {
  customerIdType: (typeof TANZANIA_CUSTOMER_ID_TYPES)[keyof typeof TANZANIA_CUSTOMER_ID_TYPES]
  customerId: string
}

const normalizedText = (value: unknown) => String(value ?? '').trim()

/**
 * FTC currently captures a customer's Tanzania TIN as its supported authority
 * identity. Do not attach an identifier to NIL: the proxy requires an ID only
 * when the ID type is not 6.
 */
export function resolveTanzaniaCustomerIdentity(
  input?: {
    tin?: unknown
  } | null,
): TanzaniaCustomerIdentity {
  const tin = normalizedText(input?.tin)
  if (tin) {
    return {
      customerIdType: TANZANIA_CUSTOMER_ID_TYPES.TIN,
      customerId: tin,
    }
  }

  return {
    customerIdType: TANZANIA_CUSTOMER_ID_TYPES.NIL,
    customerId: '',
  }
}
