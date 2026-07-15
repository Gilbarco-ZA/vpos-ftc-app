import type { SessionUser } from '@/src/shared/types'
import { NextRequest, NextResponse } from 'next/server'

import { query, queryOne } from '@/src/platform/db/postgres'
import { upsertSecureArtifact } from '@/src/platform/security/secure-artifacts'
import { readBody } from '@/src/platform/web/api/request'
import { fail, serverError } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { requireAuth } from '@/src/shared/auth'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { isTanzaniaCountry } from '@/src/modules/tanzania-fiscal/infrastructure/country'
import {
  normalizeFiscalizationTransport,
  resolveStationFiscalizationRoute,
} from '@/src/modules/tanzania-fiscal/infrastructure/route'
import {
  buildTanzaniaCloudCutoverChecklist,
  evaluateTanzaniaRouteSwitchSafety,
  getTanzaniaRouteSwitchSafety,
} from '@/src/modules/tanzania-fiscal/infrastructure/routeSwitchSafety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AnyRecord = Record<string, any>

const nowIso = () => new Date().toISOString()

function objectValue(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : {}
}

function getPath(obj: AnyRecord, path: string): any {
  let cur: any = obj
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = cur[part]
  }
  return cur
}

function firstValue(
  sources: AnyRecord[],
  paths: string[],
  fallback = '',
): string {
  for (const source of sources) {
    for (const path of paths) {
      const value = path.includes('.') ? getPath(source, path) : source[path]
      if (value == null) continue
      const text = String(value).trim()
      if (text) return text
    }
  }
  return fallback
}

function firstNumber(
  sources: AnyRecord[],
  paths: string[],
  fallback: number | null = null,
): number | null {
  const value = firstValue(sources, paths, '')
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim()
}

function cleanNullable(value: unknown): string | null {
  const text = cleanString(value)
  return text || null
}

function cleanDate(value: unknown): string | null {
  const text = cleanString(value)
  if (!text) return null
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function cleanRate(value: unknown, fallback = 0.18): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function cleanStatus(value: unknown, fallback = 'PENDING') {
  return cleanString(value || fallback).toUpperCase()
}

function stringMap(input: AnyRecord, keys: string[]) {
  return keys.reduce<AnyRecord>((acc, key) => {
    acc[key] = cleanString(input?.[key])
    return acc
  }, {})
}

function getTraRegistrationSources(fiscalRegistration: AnyRecord) {
  const data = objectValue(fiscalRegistration.data)
  const regData = objectValue(data.regData)
  const efdms = objectValue(regData.efdms)
  const resp = objectValue(efdms.efdmsresp)
  const taxcodes = objectValue(resp.taxcodes)
  return { data, regData, efdms, resp, taxcodes }
}

function getEwuraSources(ewuraConfig: AnyRecord, ewuraRegistration: AnyRecord) {
  const configData = objectValue(ewuraConfig.data)
  const nestedConfig = objectValue(ewuraConfig.config)
  const registrationData = objectValue(ewuraRegistration.data)
  const registration = objectValue(registrationData.registration)
  const response = objectValue(registrationData.response)
  return { configData, nestedConfig, registrationData, registration, response }
}

async function loadTanzaniaFiscalPayload(stationId: string) {
  const [
    station,
    settings,
    fiscalConfigRow,
    fiscalRegistrationRow,
    ewuraConfigRow,
    ewuraRegistrationRow,
    signingKey,
  ] = await Promise.all([
    queryOne<any>(
      `SELECT fs.id,
                fs.code,
                fs.name,
                fs.address,
                fs.city,
                COALESCE(
                  NULLIF(BTRIM(fs.country), ''),
                  NULLIF(BTRIM(sc.config_json #>> '{config,country}'), ''),
                  NULLIF(BTRIM(sc.config_json #>> '{country}'), '')
                ) AS country,
                fs.phone,
                fs.email,
                fs.timezone
           FROM fuel_stations fs
           LEFT JOIN station_config sc ON sc.station_id = fs.id
          WHERE fs.id = $1`,
      [stationId],
    ),
    queryOne<any>(
      `SELECT fiscalization_engine, fiscalization_transport, vat_rate_tz, auto_fiscalize_enabled
           FROM station_settings
          WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<any>(
      `SELECT station_id, config_json, created_at, updated_at
           FROM fiscal_config
          WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<any>(
      `SELECT station_id, status, registration_json, registered_at, created_at, updated_at
           FROM fiscal_registration
          WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<any>(
      `SELECT station_id, config_json, created_at, updated_at
           FROM ewura_config
          WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<any>(
      `SELECT station_id, status, registration_json, registered_at, created_at, updated_at
           FROM ewura_registration
          WHERE station_id = $1`,
      [stationId],
    ),
    queryOne<any>(
      `SELECT id, created_at
           FROM secure_artifacts
          WHERE station_id = $1
            AND artifact_type = 'cert'
            AND artifact_key = 'private-key.pem'
            AND rotated_at IS NULL
            AND deleted_at IS NULL
          LIMIT 1`,
      [stationId],
    ).catch(() => null),
  ])

  const fiscalConfig = objectValue(fiscalConfigRow?.config_json)
  const fiscalConfigData = objectValue(fiscalConfig.data)
  const fiscalRegistration = objectValue(
    fiscalRegistrationRow?.registration_json,
  )
  const tra = getTraRegistrationSources(fiscalRegistration)
  const ewuraConfig = objectValue(ewuraConfigRow?.config_json)
  const ewuraRegistration = objectValue(ewuraRegistrationRow?.registration_json)
  const ewura = getEwuraSources(ewuraConfig, ewuraRegistration)

  const fiscalSources = [
    fiscalConfig,
    fiscalConfigData,
    fiscalRegistration,
    tra.data,
    tra.regData,
    tra.efdms,
    tra.resp,
  ]
  const ewuraSources = [
    ewuraConfig,
    ewura.configData,
    ewura.nestedConfig,
    ewuraRegistration,
    ewura.registrationData,
    ewura.registration,
  ]

  const route = resolveStationFiscalizationRoute({
    stationId,
    country: station?.country ?? null,
    fiscalizationEngine: settings?.fiscalization_engine ?? 'mock',
    fiscalizationTransport: settings?.fiscalization_transport ?? 'proxy',
  })
  const activeTransport = normalizeFiscalizationTransport(
    settings?.fiscalization_transport ?? 'proxy',
  )
  const [localSwitchSafetyResult, proxySwitchSafetyResult] = await Promise.all([
    getTanzaniaRouteSwitchSafety({
      stationId,
      targetTransport: 'local_tz',
    }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    })),
    getTanzaniaRouteSwitchSafety({
      stationId,
      targetTransport: 'proxy',
    }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    })),
  ])
  const withChecklist = (value: any) =>
    value && typeof value === 'object' && 'direction' in value
      ? {
          ...value,
          cloudCutoverChecklist: buildTanzaniaCloudCutoverChecklist(value),
        }
      : value
  const localSwitchSafety = withChecklist(localSwitchSafetyResult)
  const proxySwitchSafety = withChecklist(proxySwitchSafetyResult)
  const selectedSwitchSafety =
    activeTransport === 'local_tz' ? proxySwitchSafety : localSwitchSafety

  return {
    station,
    isTanzania: isTanzaniaCountry(station?.country),
    stationSettings: {
      fiscalizationEngine: settings?.fiscalization_engine ?? 'mock',
      fiscalizationTransport: activeTransport,
      fiscalizationRoute: route.route,
      fiscalizationRouteReason: route.reason ?? null,
      canUseLocalTanzaniaFiscalization: route.canUseLocalTanzania,
      vatRateTz:
        settings?.vat_rate_tz == null ? null : Number(settings.vat_rate_tz),
      autoFiscalizeEnabled: settings?.auto_fiscalize_enabled ?? null,
    },
    signing: {
      privateKeyConfigured: !!signingKey,
      privateKeyCreatedAt: signingKey?.created_at
        ? new Date(signingKey.created_at).toISOString()
        : null,
    },
    traConfig: {
      baseUrl: firstValue(fiscalSources, [
        'traBaseUrl',
        'baseUrl',
        'TRA_BASE_URL',
      ]),
      taxIdNo: firstValue(fiscalSources, ['taxIdNo', 'TIN', 'tin']),
      certKey: firstValue(fiscalSources, ['certKey', 'vfdSerialNo', 'serial']),
      customerIdType: firstValue(fiscalSources, ['customerIdType'], '6'),
      routingKey: firstValue(
        fiscalSources,
        ['routingKey', 'routingkey'],
        'vfdrct',
      ),
      certSerial: firstValue(fiscalSources, ['certSerial', 'Cert-Serial']),
      vatRate: firstNumber(
        fiscalSources,
        ['vatRate', 'VAT_RATE'],
        settings?.vat_rate_tz == null ? 0.18 : Number(settings.vat_rate_tz),
      ),
    },
    traRegistration: {
      status: fiscalRegistrationRow?.status ?? 'PENDING',
      registeredAt: fiscalRegistrationRow?.registered_at ?? '',
      ackcode: firstValue(fiscalSources, ['ackcode']),
      ackmsg: firstValue(fiscalSources, ['ackmsg']),
      regid: firstValue(fiscalSources, ['regid', 'vfdRegId']),
      serial: firstValue(fiscalSources, ['serial', 'vfdSerialNo', 'certKey']),
      uin: firstValue(fiscalSources, ['uin']),
      tin: firstValue(fiscalSources, ['tin', 'TIN', 'taxIdNo']),
      vrn: firstValue(fiscalSources, ['vrn', 'VRN']),
      mobile: firstValue(fiscalSources, ['mobile', 'PhoneNumber']),
      address: firstValue(fiscalSources, ['address']),
      street: firstValue(fiscalSources, ['street']),
      city: firstValue(fiscalSources, ['city']),
      country: firstValue(fiscalSources, ['country'], 'TANZANIA'),
      name: firstValue(
        fiscalSources,
        ['name', 'TradeName'],
        station?.name ?? '',
      ),
      receiptcode: firstValue(fiscalSources, [
        'receiptcode',
        'receiptCode',
        'TRAReceiptCode',
      ]),
      region: firstValue(fiscalSources, ['region', 'RegionName']),
      routingkey: firstValue(
        fiscalSources,
        ['routingkey', 'routingKey'],
        'vfdrct',
      ),
      gc: firstValue(fiscalSources, ['gc']),
      taxoffice: firstValue(fiscalSources, ['taxoffice', 'taxOffice']),
      username: firstValue(fiscalSources, ['username', 'traUsername']),
      password: firstValue(fiscalSources, ['password', 'traPassword']),
      tokenpath: firstValue(fiscalSources, ['tokenpath'], 'vfdtoken'),
      taxcodes: {
        codea: firstValue([tra.taxcodes], ['codea'], '18'),
        codeb: firstValue([tra.taxcodes], ['codeb'], '0'),
        codec: firstValue([tra.taxcodes], ['codec'], '0'),
        coded: firstValue([tra.taxcodes], ['coded'], '0'),
      },
    },
    ewuraConfig: {
      baseUrl: firstValue(ewuraSources, [
        'baseUrl',
        'ewuraBaseUrl',
        'EWURA_BASE_URL',
      ]),
      TranId: firstValue(ewuraSources, ['TranId'], '1'),
      APISourceId: firstValue(ewuraSources, ['APISourceId', 'apiSourceId']),
      RetailStationName: firstValue(
        ewuraSources,
        ['RetailStationName'],
        station?.name ?? '',
      ),
      EWURALicenseNo: firstValue(ewuraSources, ['EWURALicenseNo', 'licenseNo']),
      OperatorTin: firstValue(
        ewuraSources,
        ['OperatorTin'],
        firstValue(fiscalSources, ['tin', 'taxIdNo']),
      ),
      OperatorVrn: firstValue(
        ewuraSources,
        ['OperatorVrn'],
        firstValue(fiscalSources, ['vrn']),
      ),
      OperatorName: firstValue(
        ewuraSources,
        ['OperatorName'],
        firstValue(fiscalSources, ['name'], station?.name ?? ''),
      ),
      LicenseeTraSerialNo: firstValue(
        ewuraSources,
        ['LicenseeTraSerialNo'],
        firstValue(fiscalSources, ['serial', 'certKey']),
      ),
      RegionName: firstValue(
        ewuraSources,
        ['RegionName'],
        firstValue(fiscalSources, ['region']),
      ),
      DistrictName: firstValue(ewuraSources, ['DistrictName']),
      WardName: firstValue(ewuraSources, ['WardName']),
      Zone: firstValue(ewuraSources, ['Zone']),
      ContactPersonEmailAddress: firstValue(
        ewuraSources,
        ['ContactPersonEmailAddress'],
        station?.email ?? '',
      ),
      ContactPersonPhone: firstValue(
        ewuraSources,
        ['ContactPersonPhone'],
        station?.phone ?? '',
      ),
    },
    ewuraRegistration: {
      status: ewuraRegistrationRow?.status ?? 'PENDING',
      registeredAt: ewuraRegistrationRow?.registered_at ?? '',
      response: {
        transactionId: firstValue(
          [ewura.response],
          ['transactionId', 'TranId'],
        ),
        requestName: firstValue(
          [ewura.response],
          ['requestName', 'RequestName'],
        ),
        code: firstValue([ewura.response], ['code', 'Code']),
        message: firstValue([ewura.response], ['message', 'Message']),
      },
    },
    routeSwitchSafety: {
      local_tz: localSwitchSafety,
      proxy: proxySwitchSafety,
      selected: selectedSwitchSafety,
      cloudCutoverChecklist: selectedSwitchSafety?.cloudCutoverChecklist ?? [],
    },
    raw: {
      fiscalConfig,
      fiscalRegistration,
      ewuraConfig,
      ewuraRegistration,
    },
  }
}

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    return NextResponse.json({
      ok: true,
      data: await loadTanzaniaFiscalPayload(user.stationId),
    })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const POST = async (req: NextRequest) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const existing = await loadTanzaniaFiscalPayload(user.stationId)
    if (!existing.isTanzania) {
      return fail(
        `Tanzania fiscal registration can only be configured for Tanzania stations. Current station country: ${existing.station?.country || 'not configured'}`,
        400,
      )
    }

    const body = await readBody(req)
    const traConfig = objectValue(body?.traConfig)
    const traRegistration = objectValue(body?.traRegistration)
    const ewuraConfig = objectValue(body?.ewuraConfig)
    const ewuraRegistration = objectValue(body?.ewuraRegistration)
    const signing = objectValue(body?.signing)
    const requestedTransport = normalizeFiscalizationTransport(
      body?.fiscalizationTransport ??
        existing.stationSettings?.fiscalizationTransport ??
        (body?.enableTanzaniaFiscalization === false ? 'proxy' : 'local_tz'),
    )

    const existingTransport = normalizeFiscalizationTransport(
      existing.stationSettings?.fiscalizationTransport ?? 'proxy',
    )
    const proposedPrivateKeyPem = cleanString(signing.privateKeyPem)
    const currentRouteSwitchSafety = await getTanzaniaRouteSwitchSafety({
      stationId: user.stationId,
      targetTransport: requestedTransport,
    })
    const routeSwitchSafety = evaluateTanzaniaRouteSwitchSafety({
      snapshot: {
        ...currentRouteSwitchSafety.snapshot,
        fiscalizationEngine: 'TZ',
        traBaseUrlConfigured:
          currentRouteSwitchSafety.snapshot.traBaseUrlConfigured ||
          cleanString(traConfig.baseUrl).length > 0,
        traTokenCredentialsConfigured:
          currentRouteSwitchSafety.snapshot.traTokenCredentialsConfigured ||
          (cleanString(traRegistration.username).length > 0 &&
            cleanString(traRegistration.password).length > 0),
        signingKeyConfigured:
          currentRouteSwitchSafety.snapshot.signingKeyConfigured ||
          proposedPrivateKeyPem.length > 0,
        certSerialConfigured:
          currentRouteSwitchSafety.snapshot.certSerialConfigured ||
          cleanString(traConfig.certSerial).length > 0,
        ewuraBaseUrlConfigured:
          currentRouteSwitchSafety.snapshot.ewuraBaseUrlConfigured ||
          cleanString(ewuraConfig.baseUrl).length > 0,
        ewuraApiSourceConfigured:
          currentRouteSwitchSafety.snapshot.ewuraApiSourceConfigured ||
          cleanString(ewuraConfig.APISourceId).length > 0,
        traRegistrationStatus:
          cleanString(traRegistration.status) ||
          currentRouteSwitchSafety.snapshot.traRegistrationStatus,
        ewuraRegistrationStatus:
          cleanString(ewuraRegistration.status) ||
          currentRouteSwitchSafety.snapshot.ewuraRegistrationStatus,
      },
      targetTransport: requestedTransport,
    })
    if (
      requestedTransport !== existingTransport &&
      !routeSwitchSafety.allowed
    ) {
      return fail(
        'Fiscalization route switch is blocked by Tanzania queue/config safety checks.',
        409,
        undefined,
        {
          code: 'TANZANIA_ROUTE_SWITCH_BLOCKED',
          routeSwitchSafety,
          cloudCutoverChecklist:
            buildTanzaniaCloudCutoverChecklist(routeSwitchSafety),
        },
      )
    }

    const taxcodes = objectValue(traRegistration.taxcodes)
    const fiscalConfigJson = {
      data: {
        certKey: cleanString(traConfig.certKey || traRegistration.serial),
        taxIdNo: cleanString(traConfig.taxIdNo || traRegistration.tin),
        traBaseUrl: cleanString(traConfig.baseUrl),
        customerIdType: cleanString(traConfig.customerIdType || '6'),
        routingKey: cleanString(
          traConfig.routingKey || traRegistration.routingkey || 'vfdrct',
        ),
        certSerial: cleanString(traConfig.certSerial),
        vatRate: cleanRate(traConfig.vatRate),
      },
    }

    const efdmsresp = {
      ...stringMap(traRegistration, [
        'ackcode',
        'ackmsg',
        'regid',
        'serial',
        'uin',
        'tin',
        'vrn',
        'mobile',
        'address',
        'street',
        'city',
        'country',
        'name',
        'receiptcode',
        'region',
        'routingkey',
        'gc',
        'taxoffice',
        'username',
        'password',
        'tokenpath',
      ]),
      taxcodes: stringMap(taxcodes, ['codea', 'codeb', 'codec', 'coded']),
    }

    const fiscalRegistrationJson = {
      data: {
        regData: {
          efdms: {
            efdmsresp,
            efdmssignature: cleanString(traRegistration.efdmssignature),
          },
        },
        timestamp: cleanDate(traRegistration.registeredAt) || nowIso(),
      },
    }

    const ewuraRegistrationDetails: AnyRecord = {
      TranId: Number(ewuraConfig.TranId || 1),
      ...stringMap(ewuraConfig, [
        'APISourceId',
        'RetailStationName',
        'EWURALicenseNo',
        'OperatorTin',
        'OperatorVrn',
        'OperatorName',
        'LicenseeTraSerialNo',
        'RegionName',
        'DistrictName',
        'WardName',
        'Zone',
        'ContactPersonEmailAddress',
        'ContactPersonPhone',
      ]),
    }

    const ewuraConfigJson = {
      data: {
        baseUrl: cleanString(ewuraConfig.baseUrl),
        ...ewuraRegistrationDetails,
      },
    }

    const ewuraResponse = objectValue(ewuraRegistration.response)
    const ewuraRegistrationJson = {
      version: 1,
      data: {
        registration: ewuraRegistrationDetails,
        response: {
          transactionId: cleanString(ewuraResponse.transactionId),
          requestName: cleanString(ewuraResponse.requestName),
          code: cleanString(ewuraResponse.code),
          message: cleanString(ewuraResponse.message),
        },
      },
      lastModified: Date.now(),
    }

    await query(
      `INSERT INTO station_settings (
          id, station_id, key, fiscalization_engine, fiscalization_transport, vat_rate_tz
        )
        VALUES ($1, $2, $3, 'TZ', $4, $5)
       ON CONFLICT (station_id)
       DO UPDATE SET fiscalization_engine = 'TZ',
                     fiscalization_transport = EXCLUDED.fiscalization_transport,
                     vat_rate_tz = EXCLUDED.vat_rate_tz,
                     updated_at = NOW()`,
      [
        uuidv4(),
        user.stationId,
        `settings:${user.stationId}`,
        requestedTransport,
        cleanRate(traConfig.vatRate),
      ],
    )

    await query(
      `INSERT INTO fiscal_config (station_id, config_json)
            VALUES ($1, $2::jsonb)
       ON CONFLICT (station_id)
       DO UPDATE SET config_json = EXCLUDED.config_json,
                     updated_at = NOW()`,
      [user.stationId, fiscalConfigJson],
    )

    await query(
      `INSERT INTO fiscal_registration (id, station_id, status, registration_json, registered_at)
            VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (station_id)
       DO UPDATE SET status = EXCLUDED.status,
                     registration_json = EXCLUDED.registration_json,
                     registered_at = EXCLUDED.registered_at,
                     updated_at = NOW()`,
      [
        uuidv4(),
        user.stationId,
        cleanStatus(traRegistration.status),
        fiscalRegistrationJson,
        cleanDate(traRegistration.registeredAt),
      ],
    )

    await query(
      `INSERT INTO ewura_config (station_id, config_json)
            VALUES ($1, $2::jsonb)
       ON CONFLICT (station_id)
       DO UPDATE SET config_json = EXCLUDED.config_json,
                     updated_at = NOW()`,
      [user.stationId, ewuraConfigJson],
    )

    await query(
      `INSERT INTO ewura_registration (id, station_id, status, registration_json, registered_at)
            VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (station_id)
       DO UPDATE SET status = EXCLUDED.status,
                     registration_json = EXCLUDED.registration_json,
                     registered_at = EXCLUDED.registered_at,
                     updated_at = NOW()`,
      [
        uuidv4(),
        user.stationId,
        cleanStatus(ewuraRegistration.status),
        ewuraRegistrationJson,
        cleanDate(ewuraRegistration.registeredAt),
      ],
    )

    const privateKeyPem = proposedPrivateKeyPem
    if (privateKeyPem) {
      if (!privateKeyPem.includes('PRIVATE KEY')) {
        return fail('Signing private key must be a PEM private key.', 400)
      }
      await upsertSecureArtifact({
        stationId: user.stationId,
        artifactType: 'cert',
        artifactKey: 'private-key.pem',
        payload: Buffer.from(privateKeyPem, 'utf8'),
        metadataJson: {
          source: 'admin:tanzania-fiscal',
          purpose: 'TRA and EWURA payload signing',
        },
      })
    }

    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'CONFIG_UPDATED',
      entityType: 'fiscal_registration',
      oldValues: {
        fiscalizationEngine:
          existing.stationSettings?.fiscalizationEngine ?? null,
        fiscalizationTransport:
          existing.stationSettings?.fiscalizationTransport ?? 'proxy',
      },
      newValues: {
        fiscalizationEngine: 'TZ',
        fiscalizationTransport: requestedTransport,
      },
      metadata: {
        routeSwitchSafety: {
          allowed: routeSwitchSafety.allowed,
          blockerCount: routeSwitchSafety.blockers.length,
          warningCount: routeSwitchSafety.warnings.length,
          direction: routeSwitchSafety.direction,
        },
        traTin: fiscalConfigJson.data.taxIdNo || null,
        ewuraLicenseNo: ewuraRegistrationDetails.EWURALicenseNo || null,
        signingKeyUpdated: !!privateKeyPem,
      },
    }).catch(() => {})

    return NextResponse.json({
      ok: true,
      data: await loadTanzaniaFiscalPayload(user.stationId),
    })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
