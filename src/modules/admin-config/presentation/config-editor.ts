export type Json = any

export const pretty = (v: any) => {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export const toNum = (v: any, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export const parseCsvNums = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n))

export const parseLines = (v: string) =>
  v
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)

export const joinCsv = (arr: any[]) =>
  Array.isArray(arr) ? arr.join(', ') : ''
export const joinLines = (arr: any[]) =>
  Array.isArray(arr) ? arr.join('\n') : ''

export const deepClone = <T>(v: T): T => {
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return v
  }
}

export const getIn = (obj: any, path: (string | number)[], fallback?: any) => {
  try {
    let cur = obj
    for (const p of path) {
      if (cur == null) return fallback
      cur = cur[p as any]
    }
    return cur ?? fallback
  } catch {
    return fallback
  }
}

export const setIn = (obj: any, path: (string | number)[], value: any) => {
  const next = deepClone(obj ?? {})
  let cur = next
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const nxtKey = path[i + 1]
    if (cur[key as any] == null) {
      cur[key as any] = typeof nxtKey === 'number' ? [] : {}
    }
    cur = cur[key as any]
  }
  cur[path[path.length - 1] as any] = value
  return next
}

export const toggleIn = (obj: any, path: (string | number)[]) => {
  const cur = !!getIn(obj, path, false)
  return setIn(obj, path, !cur)
}
