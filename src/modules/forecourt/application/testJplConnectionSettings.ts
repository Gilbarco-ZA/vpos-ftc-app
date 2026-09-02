import { buildFcLogonEnvelope, JplClient } from '@gilbarcoafs/doms-pos-jpl'
import type { ForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

import { parseCsvStringList } from '@/src/shared/forecourt/runtimeConfigShared'

import {
  buildJplAccessCodeFallbacks,
  normalizeJplPosId,
} from '../infrastructure/jpl/protocol/bootstrap'
import { validateDomsLiveConnectionSettings } from './domsCommissioningReadiness.helpers'

export type TestJplConnectionSettingsInput = Partial<ForecourtRuntimeConfig> &
  Record<string, unknown>

const toInt = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

const redactAccessCode = (value: string) => {
  const [password, ...flags] = String(value || '').split(',')
  const redactedPassword = password ? '***' : ''
  return [redactedPassword, ...flags].filter(Boolean).join(',')
}

const serializeError = (error: unknown) => {
  const err = error as any
  return {
    name: err?.name ? String(err.name) : 'Error',
    message: String(err?.message ?? error),
    code: err?.code ? String(err.code) : undefined,
    rejectCode: err?.rejectCode,
    rejectInfo: err?.rejectInfo,
    rejectInfoText: err?.rejectInfoText,
    data: err?.data,
  }
}

export class JplSettingsValidationError extends Error {
  status = 400
  details: unknown

  constructor(message: string, details: unknown) {
    super(message)
    this.name = 'JplSettingsValidationError'
    this.details = details
  }
}

export async function testJplConnectionSettings(
  body: TestJplConnectionSettingsInput,
) {
  const host = String(body.jplHost ?? '').trim()
  const port = toInt(body.jplPort, 8888)
  if (!host) throw new JplSettingsValidationError('JPL host is required', null)
  if (port <= 0 || port > 65535) {
    throw new JplSettingsValidationError('JPL port is invalid', { port })
  }

  const heartbeatIdleMs = toInt(body.jplHeartbeatIntervalMs, 15_000)
  const inboundSilenceMs = toInt(body.jplDeadConnectionTimeoutMs, 30_000)
  const tlsEnabled =
    port === 8889 ||
    String(body.jplTlsRequired ?? '')
      .trim()
      .toLowerCase() === 'true'

  const countryCode = String(body.jplCountryCode ?? '').trim() || '1'
  const posVersionId =
    String(body.jplPosVersionId ?? '').trim() || '470-02-1.08'
  const posId = normalizeJplPosId(body.jplPosId ?? '01', '01')
  const statusUpdateCode = Math.max(0, toInt(body.jplStatusUpdateCode, 3))
  const unsolicitedFlags = parseCsvStringList(body.jplUnsolicitedFlags)
  const mfdrFlags = parseCsvStringList(body.jplUnsolicitedMfdrFlags)
  const accessCodes = buildJplAccessCodeFallbacks({
    baseAccessCode: String(body.jplAccessCode ?? 'POS'),
    drSeconds: toInt(body.jplUnsolicitedDrSeconds, 5),
    requiredFlags: unsolicitedFlags,
    mfdrFlags,
  })

  const settingsValidation = validateDomsLiveConnectionSettings({
    jplHost: host,
    jplPort: port,
    jplPosId: posId,
    jplAccessCode: accessCodes[0] ?? String(body.jplAccessCode ?? 'POS'),
    jplCountryCode: countryCode,
    jplPosVersionId: posVersionId,
    jplExpectedMinVersion: String(body.jplExpectedMinVersion ?? '470-02-1.07'),
    jplHeartbeatIntervalMs: heartbeatIdleMs,
    jplDeadConnectionTimeoutMs: inboundSilenceMs,
    jplUnsolicitedDrSeconds: toInt(body.jplUnsolicitedDrSeconds, 5),
    jplUnsolicitedFlags: unsolicitedFlags,
    jplUnsolicitedMfdrFlags: mfdrFlags,
    jplStatusUpdateCode: statusUpdateCode,
    jplBootstrapSnapshotEnabled: body.jplBootstrapSnapshotEnabled !== false,
    bufferWarnDepthSup: toInt(body.bufferWarnDepthSup, 2),
    bufferCritDepthSup: toInt(body.bufferCritDepthSup, 5),
    bufferWarnAgeMinSup: toInt(body.bufferWarnAgeMinSup, 5),
    bufferCritAgeMinSup: toInt(body.bufferCritAgeMinSup, 15),
    bufferWarnDepthUnsup: toInt(body.bufferWarnDepthUnsup, 1),
    bufferCritDepthUnsup: toInt(body.bufferCritDepthUnsup, 3),
    bufferWarnAgeMinUnsup: toInt(body.bufferWarnAgeMinUnsup, 2),
    bufferCritAgeMinUnsup: toInt(body.bufferCritAgeMinUnsup, 10),
    jplTlsRequired: tlsEnabled,
  })

  if (settingsValidation.blockers.length > 0) {
    throw new JplSettingsValidationError(
      'JPL settings are incomplete or unsafe for live connection.',
      settingsValidation.blockers,
    )
  }

  const client = new JplClient({
    host,
    port,
    strictProtocolValidation: true,
    requestDispatchPolicy: 'strict-single-flight-when-uncorrelated',
    heartbeatIdleMs,
    inboundSilenceMs,
    requestTimeoutMs: 8_000,
    tls: tlsEnabled
      ? {
          enabled: true,
          rejectUnauthorized: false,
        }
      : undefined,
  })

  const attempts: Array<{ accessCode: string; ok: boolean; error?: any }> = []
  let acceptedAccessCode: string | null = null
  let logonResponse: any = null
  let statusUpdateOk = false
  let fpStatusOk = false
  let lastError: unknown = null

  try {
    await client.connect()
    for (const accessCode of accessCodes) {
      try {
        logonResponse = await (client as any).logon(
          buildFcLogonEnvelope({
            variant: '01H',
            accessCode,
            countryCode,
            posVersionId,
          }),
          { timeoutMs: 8_000 },
        )
        acceptedAccessCode = accessCode
        attempts.push({ accessCode: redactAccessCode(accessCode), ok: true })
        break
      } catch (error) {
        lastError = error
        attempts.push({
          accessCode: redactAccessCode(accessCode),
          ok: false,
          error: serializeError(error),
        })
      }
    }

    if (!acceptedAccessCode) {
      throw new JplSettingsValidationError(
        'JPL TCP connected, but FcLogon failed for all access-code candidates.',
        { host, port, tlsEnabled, attempts, error: serializeError(lastError) },
      )
    }

    try {
      await (client as any).setStatusUpdateMode(statusUpdateCode, {
        timeoutMs: 8_000,
      })
      statusUpdateOk = true
    } catch (error) {
      lastError = error
    }

    try {
      await (client as any).request(
        { name: 'FpStatus_req', subCode: '00H', data: { FpId: '00' } },
        { timeoutMs: 8_000 },
      )
      fpStatusOk = true
    } catch (error) {
      lastError = error
    }

    return {
      connected: true,
      loggedOn: true,
      host,
      port,
      tlsEnabled,
      posId,
      jplVersion: (client as any).getServerJplVersion?.() ?? null,
      correlationSupported:
        (client as any).getServerSupportsCorrelationIds?.() ?? null,
      acceptedAccessCode: redactAccessCode(acceptedAccessCode),
      statusUpdateOk,
      fpStatusOk,
      heartbeatIdleMs,
      inboundSilenceMs,
      logonResponse,
      attempts,
      warning: statusUpdateOk
        ? null
        : 'Logon succeeded, but the status-update mode could not be confirmed.',
      advisory: !fpStatusOk
        ? 'The controller accepted logon and status updates, but did not answer the optional all-pump snapshot request within 8 seconds.'
        : null,
      lastError: lastError ? serializeError(lastError) : null,
      settingsValidation,
    }
  } finally {
    await client.disconnect().catch(() => {})
  }
}
