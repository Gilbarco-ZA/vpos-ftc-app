export function requiresCustomerForFiscalizationRetry(input: {
  customerId?: unknown
  domsSourceSystem?: unknown
}) {
  const customerId = String(input.customerId ?? '').trim()
  if (customerId) return false

  // DOMS/JPL forecourt sales can be anonymous and are auto-fiscalized after
  // the linking window. A retry must preserve that same policy; requiring a
  // customer here would make configuration-recovery failures impossible to
  // recover from the transactions screen.
  return (
    String(input.domsSourceSystem ?? '')
      .trim()
      .toLowerCase() !== 'jpl'
  )
}
