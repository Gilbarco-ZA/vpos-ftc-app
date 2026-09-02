import type {
  RequestDispatchMode,
  RequestDispatchPolicy,
} from '@/src/modules/forecourt/infrastructure/runtimeConfig'

type RejectSummary =
  | {
      code?: string
      kind?: string
      info?: string
      correlationId?: string
      at?: number
    }
  | null
  | undefined

export type ProtocolHealthIssueCode =
  | 'version-mismatch'
  | 'secure-mode-mismatch'
  | 'correlation-unavailable'
  | 'single-flight-fallback'
  | 'recent-reject'
  | 'recent-frame-error'

export type ProtocolHealthIssue = {
  code: ProtocolHealthIssueCode
  severity: 'warn' | 'critical'
  message: string
}

export type ProtocolHealthDefaultSubscriptions = {
  unsolicitedFlags: string[]
  unsolicitedMfdrFlags: string[]
  drSeconds: number
  statusUpdateCode: number
}

export type ProtocolHealthPayload = {
  status: 'healthy' | 'degraded'
  issues: ProtocolHealthIssue[]
  protocolVersion?: string
  correlationSupported: boolean | null
  requestMode: 'correlated' | 'single-flight-fallback'
  requestDispatchMode: RequestDispatchMode
  requestDispatchPolicy: RequestDispatchPolicy
  secureTransport: boolean
  lastReject?: RejectSummary
  defaultSubscriptions: ProtocolHealthDefaultSubscriptions
  rawFrameDiagnosticsEnabled: boolean
  lastFrameDiagnostic?: {
    valid: boolean
    code: string
    message: string
    at?: number
  }
}

const parseVersionTuple = (version: string) => {
  const match = String(version || '')
    .trim()
    .match(/(\d+)-(\d+)-(\d+)\.(\d+)/)
  if (!match) return null
  return match.slice(1).map((part) => Number(part))
}

const isVersionAtLeast = (candidate: string, minimum: string) => {
  const cand = parseVersionTuple(candidate)
  const min = parseVersionTuple(minimum)
  if (!cand || !min) return true
  for (let i = 0; i < Math.max(cand.length, min.length); i += 1) {
    const a = cand[i] ?? 0
    const b = min[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return true
}

export const buildProtocolHealth = (input: {
  protocolVersion?: string
  expectedMinVersion?: string
  correlationSupported: boolean | null
  requestMode: 'correlated' | 'single-flight-fallback'
  requestDispatchMode: RequestDispatchMode
  requestDispatchPolicy: RequestDispatchPolicy
  secureTransport: boolean
  expectedSecureTransport?: boolean
  lastReject?: RejectSummary
  defaultSubscriptions: ProtocolHealthDefaultSubscriptions
  rawFrameDiagnosticsEnabled: boolean
  lastFrameDiagnostic?: {
    valid: boolean
    code: string
    message: string
    at?: number
  }
}): ProtocolHealthPayload => {
  const issues: ProtocolHealthIssue[] = []

  if (
    input.protocolVersion &&
    input.expectedMinVersion &&
    !isVersionAtLeast(input.protocolVersion, input.expectedMinVersion)
  ) {
    issues.push({
      code: 'version-mismatch',
      severity: 'critical',
      message: `protocol version ${input.protocolVersion} is below expected minimum ${input.expectedMinVersion}`,
    })
  }

  if (
    typeof input.expectedSecureTransport === 'boolean' &&
    input.expectedSecureTransport !== input.secureTransport
  ) {
    issues.push({
      code: 'secure-mode-mismatch',
      severity: 'critical',
      message: input.expectedSecureTransport
        ? 'secure transport expected but not active'
        : 'secure transport active when plain transport is expected',
    })
  }

  if (input.correlationSupported === false) {
    issues.push({
      code: 'correlation-unavailable',
      severity: 'warn',
      message: 'controller does not support request correlation IDs',
    })
  }

  if (input.requestMode === 'single-flight-fallback') {
    issues.push({
      code: 'single-flight-fallback',
      severity: 'warn',
      message: 'request flow is operating in strict single-flight mode',
    })
  }

  if (input.lastReject?.at) {
    issues.push({
      code: 'recent-reject',
      severity: 'warn',
      message: input.lastReject.info || 'recent protocol reject observed',
    })
  }

  if (input.lastFrameDiagnostic && input.lastFrameDiagnostic.valid === false) {
    issues.push({
      code: 'recent-frame-error',
      severity: 'warn',
      message:
        input.lastFrameDiagnostic.message ||
        `recent malformed JPL frame observed: ${input.lastFrameDiagnostic.code}`,
    })
  }

  return {
    status: issues.length ? 'degraded' : 'healthy',
    issues,
    protocolVersion: input.protocolVersion,
    correlationSupported: input.correlationSupported,
    requestMode: input.requestMode,
    requestDispatchMode: input.requestDispatchMode,
    requestDispatchPolicy: input.requestDispatchPolicy,
    secureTransport: input.secureTransport,
    lastReject: input.lastReject,
    defaultSubscriptions: input.defaultSubscriptions,
    rawFrameDiagnosticsEnabled: input.rawFrameDiagnosticsEnabled,
    lastFrameDiagnostic: input.lastFrameDiagnostic,
  }
}
