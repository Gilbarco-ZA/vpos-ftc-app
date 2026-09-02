import crypto from 'node:crypto'

import { PSS_XML_KEYS } from '@/src/shared/integrations/pssXml/keys'
import { kvGetMany } from '@/src/shared/storage/stationKv'

export type PssReferenceLengthProperty = {
  name: string
  value: string
  sourceShape: 'element' | 'attribute' | 'named-attribute' | 'named-element'
}

export type PssReferenceLengthDiagnostics = {
  sourceAvailable: boolean
  source: 'station_kv:pss.xml.raw'
  sourceChecksum: string | null
  properties: PssReferenceLengthProperty[]
  mlenReferenceNo: string | null
}

const isReferenceLengthName = (value: unknown) => {
  const name = String(value ?? '').trim()
  if (!name) return false
  const normalized = name.toLowerCase()
  return (
    normalized === 'mlenreferenceno' ||
    (normalized.includes('reference') &&
      (normalized.includes('len') || normalized.includes('length')))
  )
}

const cleanXmlValue = (value: unknown) =>
  String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
    .slice(0, 128)

const addProperty = (
  target: Map<string, PssReferenceLengthProperty>,
  name: unknown,
  value: unknown,
  sourceShape: PssReferenceLengthProperty['sourceShape'],
) => {
  const normalizedName = String(name ?? '').trim()
  const normalizedValue = cleanXmlValue(value)
  if (!isReferenceLengthName(normalizedName) || !normalizedValue) return
  const key = `${normalizedName.toLowerCase()}\u0000${normalizedValue}`
  if (!target.has(key)) {
    target.set(key, {
      name: normalizedName,
      value: normalizedValue,
      sourceShape,
    })
  }
}

export const extractPssReferenceLengthProperties = (
  xml: string,
): PssReferenceLengthProperty[] => {
  const properties = new Map<string, PssReferenceLengthProperty>()

  const directElement =
    /<([A-Za-z_][\w:.-]*)\b[^>]*>\s*([^<>]{1,128})\s*<\/\1\s*>/g
  for (const match of xml.matchAll(directElement)) {
    addProperty(properties, match[1], match[2], 'element')
  }

  const directAttribute = /\b([A-Za-z_][\w:.-]*)\s*=\s*(["'])([^"']*)\2/g
  for (const match of xml.matchAll(directAttribute)) {
    addProperty(properties, match[1], match[3], 'attribute')
  }

  const parameterTag = /<[^>]{1,800}>/g
  for (const match of xml.matchAll(parameterTag)) {
    const tag = match[0]
    const attrs = Array.from(tag.matchAll(directAttribute)).map((item) => ({
      name: item[1],
      value: item[3],
    }))
    const nameAttr = attrs.find((item) =>
      /^(name|key|id|parameter)$/i.test(item.name),
    )
    const valueAttr = attrs.find((item) => /^(value|val)$/i.test(item.name))
    if (nameAttr && valueAttr) {
      addProperty(
        properties,
        nameAttr.value,
        valueAttr.value,
        'named-attribute',
      )
    }
  }

  const namedElement =
    /<(?:Name|Key|Id|Parameter)\b[^>]*>\s*([^<>]{1,128})\s*<\/(?:Name|Key|Id|Parameter)>[\s\S]{0,600}?<(?:Value|Val)\b[^>]*>\s*([^<>]{1,128})\s*<\/(?:Value|Val)>/gi
  for (const match of xml.matchAll(namedElement)) {
    addProperty(properties, match[1], match[2], 'named-element')
  }

  const reversedNamedElement =
    /<(?:Value|Val)\b[^>]*>\s*([^<>]{1,128})\s*<\/(?:Value|Val)>[\s\S]{0,600}?<(?:Name|Key|Id|Parameter)\b[^>]*>\s*([^<>]{1,128})\s*<\/(?:Name|Key|Id|Parameter)>/gi
  for (const match of xml.matchAll(reversedNamedElement)) {
    addProperty(properties, match[2], match[1], 'named-element')
  }

  return Array.from(properties.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

export const getPssReferenceLengthDiagnostics = async (
  stationId: string,
): Promise<PssReferenceLengthDiagnostics> => {
  const values = await kvGetMany<string>(stationId, [
    PSS_XML_KEYS.RAW_XML,
    PSS_XML_KEYS.LAST_IMPORT_CHECKSUM,
  ])
  const rawXml = values[PSS_XML_KEYS.RAW_XML]
  const storedChecksum = values[PSS_XML_KEYS.LAST_IMPORT_CHECKSUM]

  if (typeof rawXml !== 'string' || !rawXml.trim()) {
    return {
      sourceAvailable: false,
      source: 'station_kv:pss.xml.raw',
      sourceChecksum:
        typeof storedChecksum === 'string' && storedChecksum.trim()
          ? storedChecksum.trim()
          : null,
      properties: [],
      mlenReferenceNo: null,
    }
  }

  const properties = extractPssReferenceLengthProperties(rawXml)
  const sourceChecksum =
    typeof storedChecksum === 'string' && storedChecksum.trim()
      ? storedChecksum.trim()
      : crypto.createHash('sha256').update(rawXml, 'utf8').digest('hex')
  const mlenReferenceNo =
    properties.find(
      (property) => property.name.toLowerCase() === 'mlenreferenceno',
    )?.value ?? null

  return {
    sourceAvailable: true,
    source: 'station_kv:pss.xml.raw',
    sourceChecksum,
    properties,
    mlenReferenceNo,
  }
}
