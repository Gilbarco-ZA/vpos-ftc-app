import { createHash } from 'node:crypto'

const normalizeJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeJsonValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeJsonValue(entry)]),
    )
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return value ?? null
}

export const normalizeConfigJson = (value: unknown) =>
  JSON.stringify(normalizeJsonValue(value))

export const hashConfigJson = (value: unknown) =>
  createHash('sha256').update(normalizeConfigJson(value), 'utf8').digest('hex')

export const configJsonEquals = (left: unknown, right: unknown) =>
  hashConfigJson(left) === hashConfigJson(right)
