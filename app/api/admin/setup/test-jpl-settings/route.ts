import {
  buildFcLogonEnvelope,
  JplClient,
} from '@gilbarcoafs/doms-pos-jpl'
import { NextResponse } from "next/server";

import { parseCsvStringList } from '@/src/shared/forecourt/runtimeConfigShared'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import {
  buildJplAccessCodeFallbacks,
  normalizeJplPosId,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/bootstrap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TestJplSettingsBody = Record<string, unknown>

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

const buildClient = (body: TestJplSettingsBody) => {
  const host = String(body.jplHost ?? '').trim()
  const port = toInt(body.jplPort, 8888)
  if (!host) throw new Error('JPL host is required')
  if (port <= 0 || port > 65535) throw new Error('JPL port is invalid')

  const heartbeatIdleMs = Math.max(
    5_000,
    toInt(body.jplHeartbeatIntervalMs, 15_000),
  )
  const inboundSilenceMs = Math.max(
    heartbeatIdleMs + 5_000,
    toInt(body.jplDeadConnectionTimeoutMs, 30_000),
  )

  const tlsEnabled =
    port === 8889 ||
    String(body.jplTlsRequired ?? '')
      .trim()
      .toLowerCase() === 'true'

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
          // Most field controllers use local/self-signed certificates. This is
          // only a connectivity tester; production trust should still be set in
          // the runtime deployment when available.
          rejectUnauthorized: false,
        }
      : undefined,
  })

  return { client, host, port, tlsEnabled, heartbeatIdleMs, inboundSilenceMs }
}

export const POST = defineMutationRoute<TestJplSettingsBody>({
  roles: ['administrator', 'manager'],
  csrf: false,
  handler: async (_req, { body }) => {
    const {
      client,
      host,
      port,
      tlsEnabled,
      heartbeatIdleMs,
      inboundSilenceMs,
    } = buildClient(body || {})
    const countryCode = String(body?.jplCountryCode ?? '').trim() || '1'
    const posVersionId =
      String(body?.jplPosVersionId ?? '').trim() || '470-02-1.08'
    const posId = normalizeJplPosId(body?.jplPosId ?? '01', '01')
    const statusUpdateCode = Math.max(0, toInt(body?.jplStatusUpdateCode, 3))
    const accessCodes = buildJplAccessCodeFallbacks({
      baseAccessCode: String(body?.jplAccessCode ?? 'POS'),
      drSeconds: toInt(body?.jplUnsolicitedDrSeconds, 5),
      requiredFlags: parseCsvStringList(body?.jplUnsolicitedFlags),
      mfdrFlags: parseCsvStringList(body?.jplUnsolicitedMfdrFlags),
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
        return NextResponse.json(
          {
            ok: false,
            success: false,
            error: {
              message:
                'JPL TCP connected, but FcLogon failed for all access-code candidates.',
              details: serializeError(lastError),
            },
            data: { host, port, tlsEnabled, attempts },
          },
          { status: 400 },
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

      return NextResponse.json({
        ok: true,
        success: true,
        data: {
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
          warning:
            statusUpdateOk && fpStatusOk
              ? null
              : 'Logon succeeded, but one or more post-logon checks failed. Inspect details before going live.',
          lastError: lastError ? serializeError(lastError) : null,
        },
      })
    } finally {
      await client.disconnect().catch(() => {})
    }
  },
})
