export type DomsMaintenanceFinalConfirmationInput = {
  sessionId?: unknown
  commandName?: unknown
  commandDigest?: unknown
  comparisonDigest?: unknown
  operatorNote?: unknown
  confirmPhysicalTarget?: unknown
  confirmCommandReviewed?: unknown
  confirmComparisonMatched?: unknown
  confirmImmediateSendIntent?: unknown
  confirmExecutionStillDisabled?: unknown
}

export type DomsMaintenanceFinalConfirmation = {
  confirmationId: string
  stationId: string
  sessionId: string
  commandName: string
  commandDigest: string
  comparisonDigest: string
  confirmedAt: string
  confirmedBy: {
    userId: string
    username: string
    role: string
  }
  roleRequirement: 'field_engineer'
  executionEnabled: false
  sendsDomsCommand: false
  expiresAt: string
  safetyBoundary: string
}
