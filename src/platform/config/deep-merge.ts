export function isPlainObject(value: any): value is Record<string, any> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function deepMerge<T>(base: T, override: any): T {
  if (Array.isArray(base) || Array.isArray(override)) {
    return (override ?? base) as T
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, any> = { ...base }
    for (const [k, v] of Object.entries(override)) {
      if (k in out) out[k] = deepMerge(out[k], v)
      else out[k] = v
    }
    return out as T
  }

  return (override ?? base) as T
}
