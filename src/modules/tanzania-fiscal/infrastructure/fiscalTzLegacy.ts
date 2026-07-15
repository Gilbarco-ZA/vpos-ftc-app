import crypto from 'node:crypto'

export type FiscalTzStorageEnvelope = {
  version?: number
  data?: unknown
  lastModified?: number
  checksum?: string
  [key: string]: unknown
}

export type FiscalTzQueueKind =
  | 'transaction'
  | 'report'
  | 'ewura_transaction'
  | 'ewura_report'
  | 'printer_transaction'
  | 'printer_report'

export type FiscalTzQueueStatus = 'PENDING' | 'FAILED' | 'DONE'

export type FiscalTzQueueItem = {
  sourceKey: string
  index: number
  status: FiscalTzQueueStatus
  retryCount: number
  lastError: string | null
  payload: Record<string, unknown>
}

export type FiscalTzArtifactTarget = {
  fileName: string
  artifactKind:
    | 'tra_config'
    | 'tra_device'
    | 'tra_registration'
    | 'tra_token'
    | 'ewura_config'
    | 'ewura_registration'
    | 'unknown'
  kvKey: string | null
  dbTable:
    | 'fiscal_config'
    | 'fiscal_registration'
    | 'ewura_config'
    | 'ewura_registration'
    | null
}

const QUEUE_ITEM_KEYS: Record<FiscalTzQueueKind, 'transactions' | 'reports'> = {
  transaction: 'transactions',
  ewura_transaction: 'transactions',
  printer_transaction: 'transactions',
  report: 'reports',
  ewura_report: 'reports',
  printer_report: 'reports',
}

export function unwrapFiscalTzStorageEnvelope(input: unknown): {
  data: unknown
  meta: {
    version: number | null
    lastModified: number | null
    checksum: string | null
  }
} {
  const value = input as FiscalTzStorageEnvelope | null
  const isObject = !!value && typeof value === 'object' && !Array.isArray(value)
  const hasEnvelopeData =
    isObject && Object.prototype.hasOwnProperty.call(value, 'data')

  return {
    data: hasEnvelopeData ? value.data : input,
    meta: {
      version:
        typeof value?.version === 'number' && Number.isFinite(value.version)
          ? value.version
          : null,
      lastModified:
        typeof value?.lastModified === 'number' &&
        Number.isFinite(value.lastModified)
          ? value.lastModified
          : null,
      checksum:
        typeof value?.checksum === 'string' && value.checksum.trim()
          ? value.checksum.trim()
          : null,
    },
  }
}

function normalizeFileName(fileName: string) {
  return String(fileName || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .trim()
    .toLowerCase()
}

export function resolveFiscalTzArtifactTarget(
  fileName: string,
): FiscalTzArtifactTarget {
  const name = normalizeFileName(fileName)
  if (name === 'fiscal.config.json') {
    return {
      fileName: name,
      artifactKind: 'tra_config',
      kvKey: 'vpos.tra.config',
      dbTable: 'fiscal_config',
    }
  }
  if (name === 'fiscal.device.json') {
    return {
      fileName: name,
      artifactKind: 'tra_device',
      kvKey: 'vpos.device.data',
      dbTable: null,
    }
  }
  if (name === 'fiscal.registration.json') {
    return {
      fileName: name,
      artifactKind: 'tra_registration',
      kvKey: 'vpos.device.registration',
      dbTable: 'fiscal_registration',
    }
  }
  if (name === 'fiscal.token.json') {
    return {
      fileName: name,
      artifactKind: 'tra_token',
      kvKey: 'vpos.tra.token',
      dbTable: null,
    }
  }
  if (name === 'ewura.config.json') {
    return {
      fileName: name,
      artifactKind: 'ewura_config',
      kvKey: 'vpos.ewura.config',
      dbTable: 'ewura_config',
    }
  }
  if (name === 'ewura.registration.json') {
    return {
      fileName: name,
      artifactKind: 'ewura_registration',
      kvKey: 'vpos.ewura.registration',
      dbTable: 'ewura_registration',
    }
  }
  return {
    fileName: name,
    artifactKind: 'unknown',
    kvKey: null,
    dbTable: null,
  }
}

export function fiscalTzArtifactKvValue(fileName: string, input: unknown) {
  const target = resolveFiscalTzArtifactTarget(fileName)
  const { data, meta } = unwrapFiscalTzStorageEnvelope(input)

  return {
    kind: target.artifactKind,
    sourceFile: target.fileName,
    data,
    meta,
    importedAt: new Date().toISOString(),
  }
}

function sourceKey(args: {
  stationId?: string | null
  fileName: string
  kind: FiscalTzQueueKind
  index: number
  item: unknown
}) {
  const itemText =
    typeof args.item === 'string'
      ? args.item
      : args.item && typeof args.item === 'object'
        ? JSON.stringify(args.item)
        : String(args.item ?? '')
  const digest = crypto.createHash('sha256').update(itemText).digest('hex')
  return [
    'vpos-fiscal-tz',
    args.stationId ?? '',
    normalizeFileName(args.fileName),
    args.kind,
    args.index,
    digest,
  ].join('|')
}

export function inferFiscalTzQueueStatus(fileName: string): {
  status: FiscalTzQueueStatus
  retryCount: number
  lastError: string | null
} {
  const name = normalizeFileName(fileName)
  if (/\.old(?:[._-]?\d+)?\.json$/.test(name) || /old[_-]?\d+/.test(name)) {
    return {
      status: 'FAILED',
      retryCount: 1,
      lastError:
        'Recovered from a rotated legacy vpos-fiscal-tz queue file; manual review or explicit retry is required.',
    }
  }
  return { status: 'PENDING', retryCount: 0, lastError: null }
}

export function extractFiscalTzQueueItems(args: {
  stationId?: string | null
  fileName: string
  kind: FiscalTzQueueKind
  json: unknown
}): FiscalTzQueueItem[] {
  const { data, meta } = unwrapFiscalTzStorageEnvelope(args.json)
  const listKey = QUEUE_ITEM_KEYS[args.kind]
  const root = data as Record<string, unknown> | unknown[] | null
  const objectRoot =
    root && typeof root === 'object' && !Array.isArray(root)
      ? (root as Record<string, unknown>)
      : null
  const rawItems = Array.isArray(root)
    ? root
    : objectRoot && Array.isArray(objectRoot[listKey])
      ? (objectRoot[listKey] as unknown[])
      : objectRoot && Object.keys(objectRoot).length > 0
        ? [objectRoot]
        : []

  const inferred = inferFiscalTzQueueStatus(args.fileName)

  return rawItems.map((item, index) => {
    const key = sourceKey({
      stationId: args.stationId,
      fileName: args.fileName,
      kind: args.kind,
      index,
      item,
    })
    const payloadBase =
      item && typeof item === 'object' && !Array.isArray(item)
        ? { ...(item as Record<string, unknown>) }
        : {
            legacyPath: typeof item === 'string' ? item : null,
            legacyValue: typeof item === 'string' ? undefined : item,
          }

    return {
      sourceKey: key,
      index,
      status: inferred.status,
      retryCount: inferred.retryCount,
      lastError: inferred.lastError,
      payload: {
        ...payloadBase,
        _legacyFiscalTz: {
          source: 'vpos-fiscal-tz',
          fileName: normalizeFileName(args.fileName),
          kind: args.kind,
          index,
          sourceKey: key,
          envelope: meta,
          rawItemType: Array.isArray(item) ? 'array' : typeof item,
          importedAt: new Date().toISOString(),
        },
      },
    }
  })
}

export function isFiscalTzQueueFile(fileName: string) {
  const name = normalizeFileName(fileName)
  return [
    'fiscal.transaction.queue.json',
    'fiscal.report.queue.json',
    'ewura.transactions.json',
    'ewura.reports.json',
    'printer.transaction.queue.json',
    'printer.report.queue.json',
  ].some((known) => name === known || name.startsWith(`${known}.old`))
}
