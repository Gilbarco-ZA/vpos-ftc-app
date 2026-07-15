import type { UserRole } from '@/src/shared/types'

export type DomsCommandAuthorizationDecision = {
  allowed: boolean
  commandType: string | null
  requiredRoles: UserRole[]
  reason?: string
}

const ADMIN_ONLY_COMMANDS = new Set([
  'CANCEL_FP_ESTOP',
  'RESET_FP',
  'FORCE_RESET_FP',
])

const CONTROLLED_RECOVERY_COMMANDS = new Set(['ESTOP_FP', 'CLEAR_FP_ERROR'])

const normalizeCommandType = (value: unknown) => {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase()
  return normalized || null
}

export function resolveDomsCommandType(
  commandName: string,
  payload: unknown,
): string | null {
  const body = (payload ?? {}) as Record<string, unknown>
  const normalizedName = String(commandName ?? '')
    .trim()
    .toLowerCase()

  if (normalizedName === 'send') {
    return normalizeCommandType(body.type)
  }

  if (
    normalizedName === 'clearfperror' ||
    normalizedName === 'clear_fp_error'
  ) {
    return 'CLEAR_FP_ERROR'
  }

  return null
}

export function authorizeDomsCommand(args: {
  role: UserRole
  commandName: string
  payload: unknown
}): DomsCommandAuthorizationDecision {
  const commandType = resolveDomsCommandType(args.commandName, args.payload)

  if (!commandType) {
    return {
      allowed: true,
      commandType,
      requiredRoles: ['administrator', 'manager'],
    }
  }

  if (ADMIN_ONLY_COMMANDS.has(commandType)) {
    const allowed = args.role === 'administrator'
    return {
      allowed,
      commandType,
      requiredRoles: ['administrator'],
      reason: allowed
        ? undefined
        : `${commandType} is restricted to administrators because it can restore or reset a fuelling point after an emergency or fault condition.`,
    }
  }

  if (CONTROLLED_RECOVERY_COMMANDS.has(commandType)) {
    const allowed = args.role === 'administrator' || args.role === 'manager'
    return {
      allowed,
      commandType,
      requiredRoles: ['administrator', 'manager'],
      reason: allowed
        ? undefined
        : `${commandType} requires a manager or administrator role.`,
    }
  }

  return {
    allowed: true,
    commandType,
    requiredRoles: ['administrator', 'manager'],
  }
}
