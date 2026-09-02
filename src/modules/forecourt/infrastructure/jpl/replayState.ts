import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'

const ensureReplayLocks = () => {
  if (!globalThis.__jplReplayLocks) {
    globalThis.__jplReplayLocks = new Map<string, Promise<void>>()
  }
  return globalThis.__jplReplayLocks
}

export const withReplayLock = async (
  key: string,
  fn: () => Promise<void>,
): Promise<void> => {
  const locks = ensureReplayLocks()
  const previousTail = locks.get(key) ?? Promise.resolve()

  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const currentTail = previousTail.catch(() => undefined).then(() => gate)

  locks.set(key, currentTail)

  await previousTail.catch(() => undefined)
  try {
    await fn()
  } finally {
    release()
    if (locks.get(key) === currentTail) {
      locks.delete(key)
    }
  }
}

const getInFlightReplayKeys = () => {
  if (!globalThis.__jplInFlightReplayKeys) {
    globalThis.__jplInFlightReplayKeys = new Set()
  }
  return globalThis.__jplInFlightReplayKeys
}

export const beginReplayKey = (key: string) => {
  const keys = getInFlightReplayKeys()
  if (keys.has(key)) return false
  keys.add(key)
  return true
}

export const endReplayKey = (key: string) => {
  getInFlightReplayKeys().delete(key)
}

export const getReplayConcurrencySnapshot = () => ({
  queuedLockCount: ensureReplayLocks().size,
  inFlightKeyCount: getInFlightReplayKeys().size,
})

export const resetReplayConcurrencyState = () => {
  ensureReplayLocks().clear()
  getInFlightReplayKeys().clear()
}

export const getReplayCapabilities = () => {
  if (!globalThis.__jplReplayCapabilities) {
    globalThis.__jplReplayCapabilities = {
      supervised: 'unknown',
      unsupervised: 'unknown',
    }
  }
  return globalThis.__jplReplayCapabilities
}

export const markReplayCapability = (
  mode: BufferMode,
  value: 'unknown' | 'allowed' | 'denied',
) => {
  const capabilities = getReplayCapabilities()
  capabilities[mode] = value
}

export const resetReplayCapabilities = () => {
  const capabilities = getReplayCapabilities()
  capabilities.supervised = 'unknown'
  capabilities.unsupervised = 'unknown'
}

export const canAttemptReplay = (mode: BufferMode) => {
  const capabilities = getReplayCapabilities()
  return capabilities[mode] !== 'denied'
}
