export type StationKvEnvironment = Readonly<Record<string, string | undefined>>

export type StationKvPolicyMode = 'compatibility' | 'strict'

export type StationKvOwner =
  | 'bootstrap'
  | 'environment-override'
  | 'integration-config'
  | 'integration-metadata'
  | 'operational-state'
  | 'setup-state'
  | 'sync-cursor'
  | 'legacy-compatibility'
  | 'unregistered'

export type StationKvValueKind =
  | 'any-json'
  | 'boolean-or-null'
  | 'object-or-null'
  | 'string-or-null'
  | 'sync-cursor'

export type StationKvKeyPolicy = {
  owner: StationKvOwner
  registered: boolean
  maxBytes: number
  valueKind: StationKvValueKind
  deprecated?: boolean
  description: string
}

export type PreparedStationKvWrite = {
  key: string
  value: unknown
  payload: string
  payloadBytes: number
  policy: StationKvKeyPolicy
}

const KIB = 1024
const MIB = 1024 * KIB

export const STATION_KV_MAX_KEY_LENGTH = 160
export const STATION_KV_DEFAULT_MAX_BYTES = 256 * KIB
export const STATION_KV_UNREGISTERED_MAX_BYTES = 16 * KIB
export const STATION_KV_DATABASE_MAX_BYTES = 8 * MIB

const exactPolicies: Record<string, StationKvKeyPolicy> = {
  'bootstrap.completed_at': {
    owner: 'bootstrap',
    registered: true,
    maxBytes: 2 * KIB,
    valueKind: 'string-or-null',
    description: 'First-boot completion timestamp.',
  },
  'pss.xml.raw': {
    owner: 'integration-config',
    registered: true,
    maxBytes: 8 * MIB,
    valueKind: 'string-or-null',
    description: 'Authoritative PSS XML import/export source.',
  },
  'pss.xml.parsed': {
    owner: 'legacy-compatibility',
    registered: true,
    maxBytes: 8 * MIB,
    valueKind: 'object-or-null',
    deprecated: true,
    description:
      'Deprecated parsed PSS XML duplicate retained for compatibility.',
  },
  'pss.xml.importSummary': {
    owner: 'integration-metadata',
    registered: true,
    maxBytes: 16 * KIB,
    valueKind: 'object-or-null',
    description:
      'Compact PSS import counts, checksum, source size, and normalization result.',
  },
  'pss.xml.idMap': {
    owner: 'integration-metadata',
    registered: true,
    maxBytes: 2 * MIB,
    valueKind: 'object-or-null',
    description: 'PSS-to-database identifier map required for export.',
  },
  'pss.xml.lastImportAt': {
    owner: 'integration-metadata',
    registered: true,
    maxBytes: 2 * KIB,
    valueKind: 'string-or-null',
    description: 'Latest PSS XML import timestamp.',
  },
  'pss.xml.lastImportChecksum': {
    owner: 'integration-metadata',
    registered: true,
    maxBytes: 2 * KIB,
    valueKind: 'string-or-null',
    description: 'Latest PSS XML checksum.',
  },
  'pss.xml.lastImportError': {
    owner: 'integration-metadata',
    registered: true,
    maxBytes: 32 * KIB,
    valueKind: 'string-or-null',
    description: 'Latest compact PSS XML import error.',
  },
  'pss.xml.exportRequestAt': {
    owner: 'integration-metadata',
    registered: true,
    maxBytes: 2 * KIB,
    valueKind: 'string-or-null',
    description: 'PSS XML export request timestamp.',
  },
  'pss.xml.lastExportAt': {
    owner: 'integration-metadata',
    registered: true,
    maxBytes: 2 * KIB,
    valueKind: 'string-or-null',
    description: 'Latest PSS XML export timestamp.',
  },
  'pss.xml.lastExportError': {
    owner: 'integration-metadata',
    registered: true,
    maxBytes: 32 * KIB,
    valueKind: 'string-or-null',
    description: 'Latest compact PSS XML export error.',
  },
  'setup.complete': {
    owner: 'setup-state',
    registered: true,
    maxBytes: 2 * KIB,
    valueKind: 'boolean-or-null',
    description: 'Setup completion marker.',
  },
  'setup.siteProfilePending': {
    owner: 'setup-state',
    registered: true,
    maxBytes: 2 * KIB,
    valueKind: 'boolean-or-null',
    description: 'Site profile synchronization marker.',
  },
  'setup.needsCountry': {
    owner: 'setup-state',
    registered: true,
    maxBytes: 2 * KIB,
    valueKind: 'boolean-or-null',
    description: 'Country selection requirement marker.',
  },
}

const prefixPolicies: Array<{
  prefix: string
  policy: StationKvKeyPolicy
}> = [
  {
    prefix: 'env:',
    policy: {
      owner: 'environment-override',
      registered: true,
      maxBytes: 16 * KIB,
      valueKind: 'string-or-null',
      description: 'Persisted fallback for a named process environment value.',
    },
  },
  {
    prefix: 'sync.cursor.',
    policy: {
      owner: 'sync-cursor',
      registered: true,
      maxBytes: 16 * KIB,
      valueKind: 'sync-cursor',
      description: 'Per-table station/cloud synchronization cursor.',
    },
  },
  {
    prefix: 'setup.',
    policy: {
      owner: 'setup-state',
      registered: true,
      maxBytes: 256 * KIB,
      valueKind: 'any-json',
      description: 'Temporary or bootstrap setup workflow state.',
    },
  },
  {
    prefix: 'site.',
    policy: {
      owner: 'setup-state',
      registered: true,
      maxBytes: 256 * KIB,
      valueKind: 'any-json',
      description: 'Setup compatibility state pending typed ownership.',
    },
  },
  {
    prefix: 'proxy.',
    policy: {
      owner: 'integration-config',
      registered: true,
      maxBytes: 256 * KIB,
      valueKind: 'any-json',
      description: 'Proxy integration configuration or identity metadata.',
    },
  },
  {
    prefix: 'forecourt.',
    policy: {
      owner: 'integration-metadata',
      registered: true,
      maxBytes: 512 * KIB,
      valueKind: 'any-json',
      description:
        'Forecourt integration state, leases, checklists, or status.',
    },
  },
  {
    prefix: 'doms.',
    policy: {
      owner: 'integration-metadata',
      registered: true,
      maxBytes: 512 * KIB,
      valueKind: 'any-json',
      description: 'DOMS integration state or compact diagnostics.',
    },
  },
  {
    prefix: 'vpos.',
    policy: {
      owner: 'operational-state',
      registered: true,
      maxBytes: 2 * MIB,
      valueKind: 'any-json',
      description:
        'VPOS runtime, supervisor, device, certificate, or recovery state.',
    },
  },
  {
    prefix: 'pump.',
    policy: {
      owner: 'operational-state',
      registered: true,
      maxBytes: 128 * KIB,
      valueKind: 'any-json',
      description: 'Pump operational state without a typed table owner.',
    },
  },
  {
    prefix: 'pumps.',
    policy: {
      owner: 'integration-config',
      registered: true,
      maxBytes: 512 * KIB,
      valueKind: 'any-json',
      description: 'Pumps configuration compatibility document.',
    },
  },
  {
    prefix: 'tanks.',
    policy: {
      owner: 'integration-config',
      registered: true,
      maxBytes: 512 * KIB,
      valueKind: 'any-json',
      description: 'Tanks configuration compatibility document.',
    },
  },
  {
    prefix: 'console.',
    policy: {
      owner: 'operational-state',
      registered: true,
      maxBytes: 128 * KIB,
      valueKind: 'any-json',
      description: 'Console-local operational preferences.',
    },
  },
  {
    prefix: 'push.',
    policy: {
      owner: 'operational-state',
      registered: true,
      maxBytes: 512 * KIB,
      valueKind: 'any-json',
      description: 'Push-notification subscriptions and state.',
    },
  },
  {
    prefix: 'legacy.',
    policy: {
      owner: 'legacy-compatibility',
      registered: true,
      maxBytes: 2 * MIB,
      valueKind: 'any-json',
      description: 'Legacy import compatibility data awaiting typed migration.',
    },
  },
  {
    prefix: 'fiscal.',
    policy: {
      owner: 'integration-metadata',
      registered: true,
      maxBytes: 512 * KIB,
      valueKind: 'any-json',
      description: 'Fiscal integration metadata without a typed table owner.',
    },
  },
  {
    prefix: 'attendant.',
    policy: {
      owner: 'operational-state',
      registered: true,
      maxBytes: 256 * KIB,
      valueKind: 'any-json',
      description: 'Attendant workflow state.',
    },
  },
  {
    prefix: 'pos.',
    policy: {
      owner: 'operational-state',
      registered: true,
      maxBytes: 256 * KIB,
      valueKind: 'any-json',
      description: 'POS workflow state.',
    },
  },
]

const unregisteredPolicy: StationKvKeyPolicy = {
  owner: 'unregistered',
  registered: false,
  maxBytes: STATION_KV_UNREGISTERED_MAX_BYTES,
  valueKind: 'any-json',
  description:
    'Unregistered compatibility key. Add an explicit owner before new use.',
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const validateValueKind = (
  key: string,
  value: unknown,
  valueKind: StationKvValueKind,
) => {
  switch (valueKind) {
    case 'string-or-null':
      if (value !== null && typeof value !== 'string') {
        throw new Error(`station_kv key "${key}" requires a string or null`)
      }
      return
    case 'boolean-or-null':
      if (value !== null && typeof value !== 'boolean') {
        throw new Error(`station_kv key "${key}" requires a boolean or null`)
      }
      return
    case 'object-or-null':
      if (value !== null && !isPlainObject(value)) {
        throw new Error(`station_kv key "${key}" requires an object or null`)
      }
      return
    case 'sync-cursor': {
      if (!isPlainObject(value)) {
        throw new Error(`station_kv key "${key}" requires a sync cursor object`)
      }
      const lastUpdatedAt = value.lastUpdatedAt
      const lastPk = value.lastPk
      if (lastUpdatedAt !== null && typeof lastUpdatedAt !== 'string') {
        throw new Error(
          `station_kv key "${key}" has an invalid lastUpdatedAt cursor`,
        )
      }
      if (
        lastPk !== null &&
        typeof lastPk !== 'string' &&
        typeof lastPk !== 'number'
      ) {
        throw new Error(`station_kv key "${key}" has an invalid lastPk cursor`)
      }
      return
    }
    case 'any-json':
      return
  }
}

export const getStationKvPolicyMode = (
  env: StationKvEnvironment = process.env,
): StationKvPolicyMode =>
  String(env.VPOS_STATION_KV_POLICY_MODE ?? 'compatibility')
    .trim()
    .toLowerCase() === 'strict'
    ? 'strict'
    : 'compatibility'

export const getStationKvKeyPolicy = (key: string): StationKvKeyPolicy => {
  const exact = exactPolicies[key]
  if (exact) return exact

  const prefix = prefixPolicies.find((entry) => key.startsWith(entry.prefix))
  return prefix?.policy ?? unregisteredPolicy
}

export const normalizeStationKvKey = (key: string): string => {
  const normalized = String(key ?? '').trim()
  if (!normalized) throw new Error('station_kv key is required')
  if (normalized.length > STATION_KV_MAX_KEY_LENGTH) {
    throw new Error(
      `station_kv key exceeds ${STATION_KV_MAX_KEY_LENGTH} characters`,
    )
  }
  if (/\s/.test(normalized)) {
    throw new Error('station_kv keys may not contain whitespace')
  }
  if (normalized.startsWith('env:')) {
    const name = normalized.slice(4)
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new Error(
        'station_kv environment keys must use env:UPPER_SNAKE_CASE',
      )
    }
  }
  return normalized
}

export const prepareStationKvWrite = (
  key: string,
  value: unknown,
  env: StationKvEnvironment = process.env,
): PreparedStationKvWrite => {
  const normalizedKey = normalizeStationKvKey(key)
  const normalizedValue = value === undefined ? null : value
  const policy = getStationKvKeyPolicy(normalizedKey)
  const mode = getStationKvPolicyMode(env)

  if (!policy.registered && mode === 'strict') {
    throw new Error(
      `station_kv key "${normalizedKey}" is not registered to a configuration owner`,
    )
  }

  validateValueKind(normalizedKey, normalizedValue, policy.valueKind)

  let payload: string
  try {
    payload = JSON.stringify(normalizedValue)
  } catch (error) {
    throw new Error(
      `station_kv key "${normalizedKey}" is not JSON serializable: ${String(
        (error as Error)?.message ?? error,
      )}`,
    )
  }

  if (payload === undefined) {
    throw new Error(
      `station_kv key "${normalizedKey}" is not JSON serializable`,
    )
  }

  const payloadBytes = Buffer.byteLength(payload, 'utf8')
  if (payloadBytes > policy.maxBytes) {
    throw new Error(
      `station_kv key "${normalizedKey}" exceeds its ${policy.maxBytes}-byte limit`,
    )
  }
  if (payloadBytes > STATION_KV_DATABASE_MAX_BYTES) {
    throw new Error(
      `station_kv key "${normalizedKey}" exceeds the database hard limit`,
    )
  }

  return {
    key: normalizedKey,
    value: normalizedValue,
    payload,
    payloadBytes,
    policy,
  }
}

export const listRegisteredStationKvPolicies = () => ({
  exact: Object.entries(exactPolicies).map(([key, policy]) => ({
    key,
    policy,
  })),
  prefixes: prefixPolicies.map(({ prefix, policy }) => ({ prefix, policy })),
})
