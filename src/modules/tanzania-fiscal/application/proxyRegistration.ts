import { AppError } from '@/src/shared/errors/AppError'
import {
  submitTanzaniaEwuraRegistrationViaProxy,
  submitTanzaniaTraRegistrationViaProxy,
} from '@/src/shared/proxy/client'
import { getStationKv, storeStationKv } from '@/src/shared/setup/api'

import type {
  TanzaniaEwuraRegistrationInput,
  TanzaniaTraRegistrationInput,
} from '../domain/proxyRegistration'
import {
  buildTanzaniaEwuraProxyRegistrationPayload,
  buildTanzaniaTraProxyRegistrationPayload,
  isTanzaniaRegistrationResponseSuccess,
} from '../domain/proxyRegistration'
import { importTraPkcs12 } from '../infrastructure/pkcs12'

const CONFIG_KEY = 'proxy.tanzania.registration.config'
const TRA_RESULT_KEY = 'proxy.tanzania.registration.tra.result'
const EWURA_RESULT_KEY = 'proxy.tanzania.registration.ewura.result'
const LEGACY_CONFIG_KEY = 'tanzania.proxy.registration.config'
const LEGACY_TRA_RESULT_KEY = 'tanzania.proxy.registration.tra.result'
const LEGACY_EWURA_RESULT_KEY = 'tanzania.proxy.registration.ewura.result'
const LEGACY_RESULT_KEY = 'tanzania.proxy.registration.result'

const resultMessage = (data: any, fallback: string) => {
  const candidates = [
    data?.error?.message,
    data?.message,
    data?.revenueAuthorityMessage,
    data?.details?.middlewareMessage,
    data?.details?.ackMessage,
    typeof data?.error === 'string' ? data.error : null,
    data?.detail,
    data?.title,
    typeof data === 'string' ? data : null,
  ]
  return candidates.map((value) => clean(value)).find(Boolean) || fallback
}

const SENSITIVE_FIELD =
  /(password|passphrase|private.?key|public.?key|certificate.?key|certificate.?base64|license.?key|api.?key|secret|token)/i

const redactForStorage = (value: unknown, key = ''): unknown => {
  if (SENSITIVE_FIELD.test(key)) {
    return value ? '[REDACTED]' : value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForStorage(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([childKey, child]) => [childKey, redactForStorage(child, childKey)],
      ),
    )
  }
  return value
}

const objectValue = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}

const clean = (value: unknown) => String(value ?? '').trim()

const proxyFailure = (args: {
  label: 'TRA' | 'EWURA'
  status: number
  data: unknown
}) => {
  const message = resultMessage(
    args.data,
    `${args.label} registration through vpos-proxy failed`,
  )
  const upstreamStatus = Number(args.status || 0)
  const status =
    upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502
  const code =
    status === 409
      ? 'CONFLICT'
      : status >= 400 && status < 500
        ? 'VALIDATION_ERROR'
        : 'INTERNAL_ERROR'
  return new AppError(code, message, status, {
    upstreamStatus: upstreamStatus || null,
    upstreamResponse: redactForStorage(args.data),
  })
}

const normalizedSavedConfig = (value: unknown) => {
  const stored = objectValue(value)
  if (stored.tra || stored.ewura) {
    const tra = objectValue(stored.tra)
    const ewura = objectValue(stored.ewura)
    return {
      tra: {
        tin: clean(tra.tin),
        serialNumber: clean(tra.serialNumber),
      },
      ewura: {
        retailStationName: clean(ewura.retailStationName),
        ewuraLicenseNo: clean(ewura.ewuraLicenseNo),
        regionName: clean(ewura.regionName),
        districtName: clean(ewura.districtName),
        wardName: clean(ewura.wardName),
        zone: clean(ewura.zone),
        contactPersonEmailAddress: clean(ewura.contactPersonEmailAddress),
        contactPersonPhone: clean(ewura.contactPersonPhone),
      },
      updatedAt: stored.updatedAt ?? null,
    }
  }

  // Compatibility with the original flat Tanzania setup form.
  return {
    tra: {
      tin: clean(stored.tin || stored.taxIdNo),
      serialNumber: clean(
        stored.serialNumber || stored.licenseeTraSerialNo || stored.vfdSerialNo,
      ),
    },
    ewura: {
      retailStationName: clean(stored.retailStationName || stored.operatorName),
      ewuraLicenseNo: clean(stored.ewuraLicenseNo),
      regionName: clean(stored.regionName),
      districtName: clean(stored.districtName),
      wardName: clean(stored.wardName),
      zone: clean(stored.zone),
      contactPersonEmailAddress: clean(
        stored.contactPersonEmailAddress || stored.contactEmail,
      ),
      contactPersonPhone: clean(
        stored.contactPersonPhone || stored.contactPhone,
      ),
    },
    updatedAt: stored.updatedAt ?? null,
  }
}

const registrationStatus = (value: unknown) => {
  const record = objectValue(value)
  return Object.keys(record).length ? record : null
}

export async function getTanzaniaProxyRegistration(stationId: string) {
  const [
    config,
    traResult,
    ewuraResult,
    legacyConfig,
    legacyTraResult,
    legacyEwuraResult,
    legacyResult,
  ] = await Promise.all([
    getStationKv(stationId, CONFIG_KEY),
    getStationKv(stationId, TRA_RESULT_KEY),
    getStationKv(stationId, EWURA_RESULT_KEY),
    getStationKv(stationId, LEGACY_CONFIG_KEY),
    getStationKv(stationId, LEGACY_TRA_RESULT_KEY),
    getStationKv(stationId, LEGACY_EWURA_RESULT_KEY),
    getStationKv(stationId, LEGACY_RESULT_KEY),
  ])

  return {
    proxyAvailable: true,
    configuration: normalizedSavedConfig(config ?? legacyConfig),
    registration: {
      tra:
        registrationStatus(traResult) ??
        registrationStatus(legacyTraResult) ??
        registrationStatus(legacyResult),
      ewura:
        registrationStatus(ewuraResult) ??
        registrationStatus(legacyEwuraResult),
    },
  }
}

export async function saveTanzaniaProxyRegistration(
  stationId: string,
  payload: Record<string, any>,
) {
  const current = normalizedSavedConfig(
    await getStationKv(stationId, CONFIG_KEY),
  )
  const requestedTra = objectValue(payload.tra)
  const requestedEwura = objectValue(payload.ewura)

  const configuration = {
    tra: {
      ...current.tra,
      ...requestedTra,
      password: undefined,
      licenseKey: undefined,
      certSerial: undefined,
      privateKeyBase64: undefined,
      publicKeyBase64: undefined,
      certificateBase64: undefined,
      certificatePassphrase: undefined,
    },
    ewura: {
      ...current.ewura,
      ...requestedEwura,
    },
    updatedAt: new Date().toISOString(),
  }

  await storeStationKv(
    stationId,
    CONFIG_KEY,
    redactForStorage(configuration) as Record<string, unknown>,
  )
  return configuration
}

const decodeCertificate = (value: unknown) => {
  const encoded = clean(value)
  if (!encoded) throw new Error('TRA PKCS#12 certificate package is required')
  const payload = Buffer.from(encoded, 'base64')
  if (!payload.length) {
    throw new Error('TRA PKCS#12 certificate package is empty')
  }
  return payload
}

export async function submitTanzaniaTraRegistration(
  stationId: string,
  input: TanzaniaTraRegistrationInput & {
    certificateBase64?: unknown
    certificatePassphrase?: unknown
  },
) {
  const directKeyMaterial = {
    certSerial: clean(input.certSerial),
    privateKeyBase64: clean(input.privateKeyBase64),
    publicKeyBase64: clean(input.publicKeyBase64),
  }
  const hasDirectKeyMaterial = Object.values(directKeyMaterial).every(Boolean)
  const certificateBase64 = clean(input.certificateBase64)
  const imported =
    !hasDirectKeyMaterial && certificateBase64
      ? await importTraPkcs12({
          payload: decodeCertificate(certificateBase64),
          passphrase: clean(input.certificatePassphrase),
        })
      : null
  const payload = buildTanzaniaTraProxyRegistrationPayload({
    input: hasDirectKeyMaterial
      ? input
      : {
          ...input,
          certSerial: undefined,
          privateKeyBase64: undefined,
          publicKeyBase64: undefined,
        },
    keyMaterial: imported
      ? {
          certSerial: imported.proxyCertSerialBase64,
          privateKeyBase64: imported.privateKeyBase64,
          publicKeyBase64: imported.publicKeyBase64,
        }
      : directKeyMaterial,
  })

  const result = await submitTanzaniaTraRegistrationViaProxy(stationId, payload)
  const data = result.data?.data ?? result.data
  const registrationOk =
    result.ok && isTanzaniaRegistrationResponseSuccess(data)
  await storeStationKv(stationId, TRA_RESULT_KEY, {
    ok: registrationOk,
    status: result.status,
    data: redactForStorage(data),
    ...(imported
      ? {
          certificate: {
            subject: imported.subject,
            issuer: imported.issuer,
            validFrom: imported.validFrom,
            validTo: imported.validTo,
          },
        }
      : {}),
    recordedAt: new Date().toISOString(),
  })
  if (!registrationOk) {
    throw proxyFailure({ label: 'TRA', status: result.status, data })
  }

  await saveTanzaniaProxyRegistration(stationId, {
    tra: { tin: payload.tin, serialNumber: payload.serialNumber },
  })
  return redactForStorage(data)
}

export async function submitTanzaniaEwuraRegistration(
  stationId: string,
  input: TanzaniaEwuraRegistrationInput,
) {
  const payload = buildTanzaniaEwuraProxyRegistrationPayload(input)
  const result = await submitTanzaniaEwuraRegistrationViaProxy(
    stationId,
    payload,
  )
  const data = result.data?.data ?? result.data
  const registrationOk =
    result.ok && isTanzaniaRegistrationResponseSuccess(data)
  await storeStationKv(stationId, EWURA_RESULT_KEY, {
    ok: registrationOk,
    status: result.status,
    data: redactForStorage(data),
    recordedAt: new Date().toISOString(),
  })
  if (!registrationOk) {
    throw proxyFailure({ label: 'EWURA', status: result.status, data })
  }

  await saveTanzaniaProxyRegistration(stationId, { ewura: payload })
  return redactForStorage(data)
}

/**
 * Compatibility entrypoint for older admin routes. New setup/admin clients
 * should call the TRA and EWURA registration functions explicitly.
 */
export async function submitTanzaniaProxyRegistration(
  stationId: string,
  payload: Record<string, any>,
) {
  const registrationType = clean(payload.registrationType).toUpperCase()
  if (registrationType === 'TRA') {
    return await submitTanzaniaTraRegistration(stationId, {
      tin: payload.tin ?? payload.taxIdNo,
      serialNumber:
        payload.serialNumber ??
        payload.licenseeTraSerialNo ??
        payload.vfdSerialNo,
      password: payload.password,
      certSerial: payload.certSerial,
      privateKeyBase64: payload.privateKeyBase64,
      publicKeyBase64: payload.publicKeyBase64,
      licenseKey:
        payload.licenseKey ?? payload.certificateKey ?? payload.certKey,
      certificateBase64: payload.certificateBase64,
      certificatePassphrase:
        payload.certificatePassphrase ?? payload.passphrase,
    })
  }
  if (registrationType === 'EWURA') {
    return await submitTanzaniaEwuraRegistration(stationId, payload)
  }
  throw new Error('Tanzania registration type must be TRA or EWURA')
}
