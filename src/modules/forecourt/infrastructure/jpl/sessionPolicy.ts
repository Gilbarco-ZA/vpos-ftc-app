export type JplConnectionPolicyInput = {
  heartbeatIntervalMs?: unknown
  deadConnectionTimeoutMs?: unknown
}

export type JplConnectionPolicy = {
  heartbeatIntervalMs: number
  deadConnectionTimeoutMs: number
  monitorIntervalMs: number
}

export type JplConnectionLiveness = {
  status: 'unknown' | 'healthy' | 'dead'
  ageMs: number | null
  lastSeenAt: number | null
  deadConnectionTimeoutMs: number
}

const finitePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.trunc(parsed)
}

export const resolveJplConnectionPolicy = (
  input: JplConnectionPolicyInput = {},
): JplConnectionPolicy => {
  const heartbeatIntervalMs = Math.max(
    5_000,
    finitePositiveInt(input.heartbeatIntervalMs, 15_000),
  )
  const deadConnectionTimeoutMs = Math.max(
    heartbeatIntervalMs + 5_000,
    finitePositiveInt(input.deadConnectionTimeoutMs, 30_000),
  )

  return {
    heartbeatIntervalMs,
    deadConnectionTimeoutMs,
    monitorIntervalMs: Math.max(
      1_000,
      Math.min(5_000, Math.trunc(heartbeatIntervalMs / 2)),
    ),
  }
}

export const calculateJplReconnectDelay = (input: {
  attempt?: unknown
  baseDelayMs?: unknown
  maxDelayMs?: unknown
}) => {
  const attempt = Math.max(1, finitePositiveInt(input.attempt, 1))
  const baseDelayMs = Math.max(1, finitePositiveInt(input.baseDelayMs, 1_000))
  const maxDelayMs = Math.max(
    baseDelayMs,
    finitePositiveInt(input.maxDelayMs, 30_000),
  )

  return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
}

export const evaluateJplConnectionLiveness = (input: {
  now?: unknown
  lastMessageAt?: unknown
  lastConnectAt?: unknown
  deadConnectionTimeoutMs?: unknown
}): JplConnectionLiveness => {
  const now = finitePositiveInt(input.now, Date.now())
  const lastMessageAt = Number(input.lastMessageAt)
  const lastConnectAt = Number(input.lastConnectAt)
  const lastSeenAt =
    Number.isFinite(lastMessageAt) && lastMessageAt > 0
      ? Math.trunc(lastMessageAt)
      : Number.isFinite(lastConnectAt) && lastConnectAt > 0
        ? Math.trunc(lastConnectAt)
        : null
  const deadConnectionTimeoutMs = Math.max(
    1,
    finitePositiveInt(input.deadConnectionTimeoutMs, 30_000),
  )

  if (lastSeenAt == null) {
    return {
      status: 'unknown',
      ageMs: null,
      lastSeenAt: null,
      deadConnectionTimeoutMs,
    }
  }

  const ageMs = Math.max(0, now - lastSeenAt)
  return {
    status: ageMs > deadConnectionTimeoutMs ? 'dead' : 'healthy',
    ageMs,
    lastSeenAt,
    deadConnectionTimeoutMs,
  }
}
