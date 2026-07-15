import { createHash } from 'node:crypto'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const canonicalizeDomsMaintenanceValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeDomsMaintenanceValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeDomsMaintenanceValue(value[key])]),
  )
}

export const digestDomsMaintenanceValue = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalizeDomsMaintenanceValue(value)))
    .digest('hex')

export const validateDomsMaintenanceEnvelope = (
  value: unknown,
  fieldName = 'envelope',
) => {
  if (!isRecord(value)) throw new Error(`${fieldName} must be a JPL envelope`)
  const name = String(value.name ?? '').trim()
  const subCode = String(value.subCode ?? '').trim()
  if (!name) throw new Error(`${fieldName}.name is required`)
  if (!/^[0-9A-F]{2}H$/.test(subCode)) {
    throw new Error(`${fieldName}.subCode must be a canonical CODE1 value`)
  }
  if (!isRecord(value.data))
    throw new Error(`${fieldName}.data must be an object`)
  return { ...value, name, subCode, data: value.data }
}
