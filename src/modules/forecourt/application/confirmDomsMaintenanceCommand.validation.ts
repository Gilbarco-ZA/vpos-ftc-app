import type { SessionUser } from '@/src/shared/types'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import type {
  DomsMaintenanceFinalConfirmation,
  DomsMaintenanceFinalConfirmationInput,
} from './confirmDomsMaintenanceCommand.types'

const MAX_NOTE_LENGTH = 1000
const SHA256_HEX = /^[a-f0-9]{64}$/i

const requireTrue = (value: unknown, fieldName: string) => {
  if (value !== true) throw new Error(`${fieldName} must be confirmed`)
}

const requireDigest = (value: unknown, fieldName: string) => {
  const digest = requireNonEmptyString(value, fieldName)
  if (!SHA256_HEX.test(digest)) {
    throw new Error(`${fieldName} must be a SHA-256 hex digest`)
  }
  return digest.toLowerCase()
}

const parseOptionalNote = (value: unknown) => {
  if (value == null) return null
  const note = String(value).trim()
  if (!note) return null
  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error(
      `operatorNote must be ${MAX_NOTE_LENGTH} characters or fewer`,
    )
  }
  return note
}

export function validateDomsMaintenanceFinalConfirmation(
  input: DomsMaintenanceFinalConfirmationInput,
  user: Pick<SessionUser, 'id' | 'stationId' | 'username' | 'role'>,
): Omit<
  DomsMaintenanceFinalConfirmation,
  'confirmationId' | 'confirmedAt' | 'expiresAt'
> & {
  operatorNote: string | null
} {
  if (user.role !== 'field_engineer') {
    throw new Error(
      'DOMS/PSS write confirmation requires the field_engineer role',
    )
  }

  requireTrue(input.confirmPhysicalTarget, 'confirmPhysicalTarget')
  requireTrue(input.confirmCommandReviewed, 'confirmCommandReviewed')
  requireTrue(input.confirmComparisonMatched, 'confirmComparisonMatched')
  requireTrue(input.confirmImmediateSendIntent, 'confirmImmediateSendIntent')
  requireTrue(
    input.confirmExecutionStillDisabled,
    'confirmExecutionStillDisabled',
  )

  const commandDigest = requireDigest(input.commandDigest, 'commandDigest')
  const comparisonDigest = requireDigest(
    input.comparisonDigest,
    'comparisonDigest',
  )
  if (commandDigest !== comparisonDigest) {
    throw new Error(
      'commandDigest must match comparisonDigest before final confirmation',
    )
  }

  return {
    stationId: requireNonEmptyString(user.stationId, 'stationId'),
    sessionId: requireNonEmptyString(input.sessionId, 'sessionId'),
    commandName: requireNonEmptyString(input.commandName, 'commandName'),
    commandDigest,
    comparisonDigest,
    operatorNote: parseOptionalNote(input.operatorNote),
    confirmedBy: {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
    roleRequirement: 'field_engineer',
    executionEnabled: false,
    sendsDomsCommand: false,
    safetyBoundary:
      'Final confirmation is recorded for audit only. DOMS/PSS write execution remains hard-disabled and no command is sent.',
  }
}
