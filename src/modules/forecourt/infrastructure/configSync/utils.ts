export const ensureArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : []

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null

export const getAtPath = (root: unknown, path: string): unknown => {
  const parts = path.split('.').map((part) => part.trim())
  let cursor: unknown = root

  for (const part of parts) {
    if (!part) continue
    const rec = asRecord(cursor)
    if (!rec) return undefined

    if (part in rec) {
      cursor = rec[part]
      continue
    }

    const key = Object.keys(rec).find(
      (k) => k.toLowerCase() === part.toLowerCase(),
    )
    if (!key) return undefined
    cursor = rec[key]
  }

  return cursor
}

export const collectArraysByKeys = (
  root: unknown,
  keys: string[],
  maxDepth = 5,
): unknown[][] => {
  const wanted = new Set(keys.map((k) => k.toLowerCase()))
  const out: unknown[][] = []
  const visited = new Set<unknown>()

  const walk = (node: unknown, depth: number) => {
    if (depth > maxDepth) return
    if (!node || typeof node !== 'object') return
    if (visited.has(node)) return
    visited.add(node)

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }

    const rec = node as Record<string, unknown>
    for (const [key, value] of Object.entries(rec)) {
      if (Array.isArray(value)) {
        if (wanted.has(key.toLowerCase()) && value.length) {
          out.push(value)
        }
        for (const item of value) walk(item, depth + 1)
        continue
      }

      if (value && typeof value === 'object') {
        walk(value, depth + 1)
      }
    }
  }

  walk(root, 0)
  return out
}

export const firstArrayAtPaths = (root: unknown, paths: string[]): any[] => {
  for (const p of paths) {
    const value = getAtPath(root, p)
    if (Array.isArray(value)) return value as any[]
  }
  return []
}

const decodeXmlText = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const parseXmlAttributes = (attrText: string) => {
  const attrs: Record<string, string> = {}
  const attrRegex = /([A-Za-z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(attrText)) !== null) {
    const key = match[1]
    const raw = match[2] ?? match[3] ?? ''
    attrs[key] = decodeXmlText(raw).trim()
  }
  return attrs
}

const toCamelCase = (value: string) =>
  value
    .replace(/[-_]+(.)/g, (_, ch) => String(ch).toUpperCase())
    .replace(/^(.)/, (ch) => ch.toLowerCase())

const toSnakeCase = (value: string) =>
  value
    .replace(/([A-Z])/g, '_$1')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()

const applyXmlValue = (
  target: Record<string, unknown>,
  key: string,
  value: string,
) => {
  if (!value) return
  const variants = new Set([key, toCamelCase(key), toSnakeCase(key)])
  for (const variant of variants) {
    if (!(variant in target)) target[variant] = value
  }
}

type XmlElement = { attrs: Record<string, string>; inner: string }

export const parseXmlElements = (xml: string, tag: string): XmlElement[] => {
  const results: XmlElement[] = []
  const regex = new RegExp(
    `<${tag}\\b([^>/]*?)(?:>([\\s\\S]*?)</${tag}>|\\s*/>)`,
    'gi',
  )
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    results.push({
      attrs: parseXmlAttributes(match[1] ?? ''),
      inner: match[2] ?? '',
    })
  }
  return results
}

const readXmlChildValue = (xml: string, tag: string): string | null => {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const match = regex.exec(xml)
  if (!match) return null
  return decodeXmlText(match[1].trim())
}

export const buildXmlRecord = (element: XmlElement, childTags: string[]) => {
  const record: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(element.attrs)) {
    applyXmlValue(record, key, value)
  }

  for (const tag of childTags) {
    const value = readXmlChildValue(element.inner, tag)
    if (value) applyXmlValue(record, tag, value)
  }

  return record
}
