export type RetryPolicyOptions = {
  baseSeconds?: number
  factor?: number
  minSeconds?: number
  maxSeconds?: number
}

export const DEFAULT_RETRY_POLICY: Required<RetryPolicyOptions> = {
  baseSeconds: 2,
  factor: 2,
  minSeconds: 2,
  maxSeconds: 300,
}

export function calculateExponentialBackoffSeconds(
  retryCount: number,
  options: RetryPolicyOptions = {},
): number {
  const { baseSeconds, factor, minSeconds, maxSeconds } = {
    ...DEFAULT_RETRY_POLICY,
    ...options,
  }

  const exponent = Math.max(0, Number.isFinite(retryCount) ? retryCount : 0)
  const raw = baseSeconds * Math.pow(factor, exponent)
  const bounded = Math.min(maxSeconds, Math.max(minSeconds, Math.floor(raw)))
  return Number.isFinite(bounded) ? bounded : minSeconds
}

export const proxySenderRetryPolicy = {
  baseSeconds: 5,
  factor: 2,
  minSeconds: 5,
  maxSeconds: 300,
} as const
