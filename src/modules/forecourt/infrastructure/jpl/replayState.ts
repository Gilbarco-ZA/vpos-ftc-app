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
  const prev = locks.get(key) ?? Promise.resolve()

  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })

  locks.set(
    key,
    prev
      .catch(() => {
        // keep queue progressing
      })
      .then(() => current),
  )

  await prev
  try {
    await fn()
  } finally {
    release()
    if (locks.get(key) === current) {
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
  const s = getInFlightReplayKeys()
  if (s.has(key)) return false
  s.add(key)
  return true
}

export const endReplayKey = (key: string) => {
  getInFlightReplayKeys().delete(key)
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
  const caps = getReplayCapabilities()
  caps[mode] = value
}

export const canAttemptReplay = (mode: BufferMode) => {
  const caps = getReplayCapabilities()
  return caps[mode] !== 'denied'
}
