import { randomUUID as nodeRandomUUID } from 'node:crypto'

/** Check whether a string looks like a UUID (8-4-4-4-12 hex, 36 chars). */
export const isUuid = (value: string): boolean =>
  /^[0-9a-fA-F-]{36}$/.test(value)

/**
 * Generate a RFC4122 v4 UUID.
 *
 * - On Node.js, uses `node:crypto.randomUUID()`.
 * - In browser/edge runtimes, falls back to `globalThis.crypto.randomUUID()`.
 */
export const uuidv4 = (): string => {
  if (typeof nodeRandomUUID === 'function') return nodeRandomUUID()

  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } }
  if (g.crypto?.randomUUID) return g.crypto.randomUUID()

  throw new Error(
    'No UUID generator available. Expected node:crypto.randomUUID or globalThis.crypto.randomUUID.',
  )
}
