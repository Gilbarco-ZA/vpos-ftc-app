import { queryOne } from '@/src/platform/db/postgres'
import { getEnvValue } from '@/src/shared/config/envDb'
import { kvGetMany } from '@/src/shared/storage/stationKv'

import {
  readTanzaniaCertSerialBase64,
  readTanzaniaPrivateKeyPem,
} from './certificates'
import {
  EWURA_DEFAULT_API_SOURCE_ID,
  EWURA_PRODUCTION_BASE_URL,
  TRA_PRODUCTION_BASE_URL,
} from './defaults'

export type TanzaniaFiscalConfig = {
  stationId: string
  proxy: {
    deviceId: string | null
    registeredDeviceId: string | null
    deviceIdOverride: string | null
  }
  station: {
    id: string
    code: string | null
    name: string
    address: string | null
    city: string | null
    country: string | null
    phone: string | null
    email: string | null
    timezone: string
  }
  settings: {
    fiscalizationEngine: string
    fiscalizationTransport: 'proxy' | 'local_tz'
    vatRate: number
  }
  tra: {
    baseUrl: string | null
    skipSigningForDebug: boolean
    taxIdNo: string | null
    certKey: string | null
    vfdRegId: string | null
    vfdSerialNo: string | null
    receiptCode: string | null
    customerIdType: string
    username: string | null
    password: string | null
    routingKey: string
    certSerial: string | null
  }
  ewura: {
    baseUrl: string | null
    apiSourceId: string | null
    licenseNo: string | null
    registration: Record<string, any>
    skipSigningForDebug: boolean
    failureMode: 'async_retry' | 'block_transaction'
    maxRetryAttempts: number
    retryBaseDelaySeconds: number
    retryMaxDelaySeconds: number
  }
}

type StationRow = TanzaniaFiscalConfig['station'] & {
  fiscalization_engine: string | null
  fiscalization_transport: 'proxy' | 'local_tz' | null
  vat_rate_tz: string | number | null
  tanzania_device_id_override: string | null
}

const toObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}

function pickPath(obj: Record<string, any>, path: string): unknown {
  let cur: any = obj
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[part]
  }
  return cur
}

function pickString(
  sources: Record<string, any>[],
  keys: string[],
): string | null {
  for (const src of sources) {
    for (const key of keys) {
      const value = key.includes('.') ? pickPath(src, key) : src[key]
      if (value == null) continue
      const text = String(value).trim()
      if (text.length) return text
    }
  }
  return null
}

function pickNumber(
  sources: Record<string, any>[],
  keys: string[],
  fallback: number,
): number {
  const value = pickString(sources, keys)
  if (value == null) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function pickBoolean(
  sources: Record<string, any>[],
  keys: string[],
  fallback = false,
): boolean {
  const value = pickString(sources, keys)
  if (value == null) return fallback
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase())
}

function normalizeEwuraFailureMode(
  value: string | null,
): 'async_retry' | 'block_transaction' {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (
    normalized === 'block' ||
    normalized === 'blocking' ||
    normalized === 'block_transaction' ||
    normalized === 'fail_transaction'
  ) {
    return 'block_transaction'
  }
  return 'async_retry'
}

async function getStationEnvValue(stationId: string, name: string) {
  const value = await getEnvValue(stationId, name)
  return value && value.trim().length ? value.trim() : null
}

async function getFirstEnvValue(stationId: string, names: string[]) {
  for (const name of names) {
    const value = await getStationEnvValue(stationId, name)
    if (value) return value
  }
  return null
}

export async function readTanzaniaFiscalConfig(
  stationId: string,
): Promise<TanzaniaFiscalConfig> {
  const row = await queryOne<StationRow>(
    `SELECT fs.id,
            fs.code,
            fs.name,
            fs.address,
            fs.city,
            fs.country,
            fs.phone,
            fs.email,
            COALESCE(NULLIF(BTRIM(fs.timezone), ''), 'Africa/Dar_es_Salaam') AS timezone,
            ss.fiscalization_engine,
            ss.fiscalization_transport,
            ss.vat_rate_tz,
            ss.tanzania_device_id_override
       FROM fuel_stations fs
       LEFT JOIN station_settings ss ON ss.station_id = fs.id
      WHERE fs.id = $1
      LIMIT 1`,
    [stationId],
  )

  if (!row?.id) throw new Error(`Station ${stationId} not found`)

  const [
    ewuraConfigRow,
    ewuraRegistrationRow,
    fiscalConfigRow,
    fiscalRegistrationRow,
    kvs,
  ] = await Promise.all([
    queryOne<{ config_json: unknown }>(
      `SELECT config_json FROM ewura_config WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<{ registration_json: unknown }>(
      `SELECT registration_json FROM ewura_registration WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<{ config_json: unknown }>(
      `SELECT config_json FROM fiscal_config WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<{ registration_json: unknown }>(
      `SELECT registration_json FROM fiscal_registration WHERE station_id = $1`,
      [stationId],
    ),
    kvGetMany<any>(stationId, [
      'site.profile',
      'vpos.device.data',
      'vpos.device.registration',
      'vpos.cert.data',
      'vpos.cert.passphrase',
      'vpos.tra.config',
      'vpos.tra.token',
      'vpos.ewura.config',
      'vpos.ewura.registration',
    ]),
  ])

  const ewuraConfig = toObject(ewuraConfigRow?.config_json)
  const ewuraRegistration = toObject(ewuraRegistrationRow?.registration_json)
  const fiscalConfig = toObject(fiscalConfigRow?.config_json)
  const fiscalRegistration = toObject(fiscalRegistrationRow?.registration_json)
  const siteProfile = toObject(kvs['site.profile'])
  const deviceData = toObject(kvs['vpos.device.data'])
  const deviceRegistration = toObject(kvs['vpos.device.registration'])
  const traConfig = toObject(kvs['vpos.tra.config'])
  const traConfigData = toObject(traConfig.data)
  const traToken = toObject(kvs['vpos.tra.token'])
  const traTokenData = toObject(traToken.data)
  const ewuraKvConfig = toObject(kvs['vpos.ewura.config'])
  const ewuraKvConfigData = toObject(ewuraKvConfig.data)
  const ewuraKvRegistration = toObject(kvs['vpos.ewura.registration'])
  const ewuraKvRegistrationData = toObject(ewuraKvRegistration.data)
  const ewuraData = toObject(ewuraConfig.data)
  const ewuraNestedConfig = toObject(ewuraConfig.config)
  const ewuraNestedRegistration = toObject(ewuraConfig.registration)
  const ewuraRegistrationData = toObject(ewuraRegistration.data)
  const ewuraRegistrationNested = toObject(ewuraRegistrationData.registration)
  const fiscalConfigData = toObject(fiscalConfig.data)
  const fiscalRegistrationData = toObject(fiscalRegistration.data)
  const fiscalRegistrationRegData = toObject(fiscalRegistrationData.regData)
  const fiscalRegistrationEfdms = toObject(fiscalRegistrationRegData.efdms)
  const fiscalRegistrationResp = toObject(fiscalRegistrationEfdms.efdmsresp)

  const sources = [
    ewuraConfig,
    ewuraData,
    ewuraNestedConfig,
    ewuraNestedRegistration,
    ewuraRegistration,
    ewuraRegistrationData,
    ewuraRegistrationNested,
    fiscalConfig,
    fiscalConfigData,
    fiscalRegistration,
    fiscalRegistrationData,
    fiscalRegistrationRegData,
    fiscalRegistrationEfdms,
    fiscalRegistrationResp,
    traConfig,
    traConfigData,
    traToken,
    traTokenData,
    ewuraKvConfig,
    ewuraKvConfigData,
    ewuraKvRegistration,
    ewuraKvRegistrationData,
    deviceData,
    deviceRegistration,
    siteProfile,
  ]

  const traBaseUrl =
    pickString(sources, [
      'traBaseUrl',
      'TRA_BASE_URL',
      'tra.baseUrl',
      'fiscalBaseUrl',
      'fiscal.baseUrl',
    ]) ??
    (await getFirstEnvValue(stationId, [
      'TZ_TRA_BASE_URL',
      'TRA_BASE_URL',
      'TZ_FISCAL_ENDPOINT',
    ])) ??
    TRA_PRODUCTION_BASE_URL

  const ewuraBaseUrl =
    pickString(sources, [
      'baseUrl',
      'EWURA_BASE_URL',
      'ewuraBaseUrl',
      'ewura.baseUrl',
    ]) ??
    (await getFirstEnvValue(stationId, [
      'EWURA_BASE_URL',
      'TZ_EWURA_BASE_URL',
    ])) ??
    EWURA_PRODUCTION_BASE_URL

  const vatRate = (() => {
    const fromSettings = Number(row.vat_rate_tz)
    if (Number.isFinite(fromSettings) && fromSettings > 0) return fromSettings
    return pickNumber(sources, ['vatRate', 'VAT_RATE', 'tax.rate'], 0.18)
  })()

  const skipSigningForDebug = pickBoolean(
    sources,
    ['skipSigningForDebug', 'SKIP_SIGNING'],
    false,
  )

  const registeredDeviceId = pickString(
    [deviceData, deviceRegistration],
    [
      'deviceId',
      'device_id',
      'deviceSettings.deviceId',
      'deviceSettings.device_id',
      'registrationStatus.deviceSettings.deviceId',
      'registrationStatus.deviceSettings.device_id',
      'data.deviceId',
      'data.device_id',
      'data.deviceSettings.deviceId',
      'data.deviceSettings.device_id',
    ],
  )
  const deviceIdOverride =
    String(row.tanzania_device_id_override ?? '').trim() || null

  return {
    stationId,
    proxy: {
      deviceId: deviceIdOverride ?? registeredDeviceId,
      registeredDeviceId,
      deviceIdOverride,
    },
    station: {
      id: row.id,
      code: row.code ?? null,
      name: row.name,
      address: row.address ?? null,
      city: row.city ?? null,
      country: row.country ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      timezone: row.timezone || 'Africa/Dar_es_Salaam',
    },
    settings: {
      fiscalizationEngine: row.fiscalization_engine || 'mock',
      fiscalizationTransport: row.fiscalization_transport || 'proxy',
      vatRate,
    },
    tra: {
      baseUrl: traBaseUrl,
      skipSigningForDebug,
      taxIdNo: pickString(sources, [
        'taxIdNo',
        'tin',
        'TIN',
        'OperatorTin',
        'operatorTin',
      ]),
      certKey: pickString(sources, ['certKey', 'CERTKEY', 'certificateKey']),
      vfdRegId: pickString(sources, [
        'vfdRegId',
        'vfdRegID',
        'regId',
        'REGID',
        'regid',
        'efdms.efdmsresp.regid',
        'regData.efdms.efdmsresp.regid',
      ]),
      vfdSerialNo: pickString(sources, [
        'vfdSerialNo',
        'vfdSerialNumber',
        'serial',
        'certKey',
        'SerialNo',
        'serialNo',
        'efdms.efdmsresp.serial',
        'regData.efdms.efdmsresp.serial',
      ]),
      receiptCode: pickString(sources, [
        'receiptCode',
        'receiptcode',
        'RCTVCODE',
        'efdms.efdmsresp.receiptcode',
        'regData.efdms.efdmsresp.receiptcode',
      ]),
      customerIdType:
        pickString(sources, ['customerIdType', 'customer.idType']) ?? '6',
      username: pickString(sources, [
        'username',
        'traUsername',
        'efdms.efdmsresp.username',
        'regData.efdms.efdmsresp.username',
      ]),
      password: pickString(sources, [
        'password',
        'traPassword',
        'efdms.efdmsresp.password',
        'regData.efdms.efdmsresp.password',
      ]),
      routingKey:
        pickString(sources, ['routingKey', 'routingkey', 'tra.routingKey']) ??
        'vfdrct',
      certSerial: pickString(sources, ['certSerial', 'Cert-Serial']),
    },
    ewura: {
      baseUrl: ewuraBaseUrl,
      apiSourceId:
        pickString(sources, [
          'apiSourceId',
          'APISourceId',
          'EWURA_API_SOURCE_ID',
          'data.APISourceId',
          'data.registration.APISourceId',
        ]) ?? EWURA_DEFAULT_API_SOURCE_ID,
      licenseNo: pickString(sources, [
        'licenseNo',
        'EWURALicenseNo',
        'EWURA_LICENSE_NO',
        'data.EWURALicenseNo',
        'data.registration.EWURALicenseNo',
      ]),
      registration: {
        ...ewuraConfig,
        ...ewuraData,
        ...ewuraNestedRegistration,
        ...ewuraRegistration,
        ...ewuraRegistrationData,
        ...ewuraRegistrationNested,
      },
      skipSigningForDebug,
      failureMode: normalizeEwuraFailureMode(
        pickString(sources, [
          'failureMode',
          'ewuraFailureMode',
          'EWURA_FAILURE_MODE',
          'data.failureMode',
        ]),
      ),
      maxRetryAttempts: Math.max(
        1,
        Math.floor(
          pickNumber(
            sources,
            ['maxRetryAttempts', 'EWURA_MAX_RETRY_ATTEMPTS'],
            20,
          ),
        ),
      ),
      retryBaseDelaySeconds: Math.max(
        1,
        Math.floor(
          pickNumber(
            sources,
            ['retryBaseDelaySeconds', 'EWURA_RETRY_BASE_SECONDS'],
            60,
          ),
        ),
      ),
      retryMaxDelaySeconds: Math.max(
        60,
        Math.floor(
          pickNumber(
            sources,
            ['retryMaxDelaySeconds', 'EWURA_RETRY_MAX_SECONDS'],
            3600,
          ),
        ),
      ),
    },
  }
}

export async function readSigningKeyPem(
  stationId: string,
): Promise<string | null> {
  return await readTanzaniaPrivateKeyPem(stationId, 'tra')
}

export async function readCertSerial(
  stationId: string,
): Promise<string | null> {
  return await readTanzaniaCertSerialBase64(stationId, 'tra')
}
