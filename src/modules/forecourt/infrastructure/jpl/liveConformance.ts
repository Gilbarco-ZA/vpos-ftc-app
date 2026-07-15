import type { DomsJplSimulatorEnvelope } from '@/src/modules/forecourt/infrastructure/jpl/simulator'

import {
  normalizeFpFuellingDataPayload,
  normalizeFpStatusPayload,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/normalize'
import { scaleByDecimals } from '@/src/modules/forecourt/infrastructure/transactionValues'

export type DomsJplLiveConformanceOptions = {
  moneyDecimals?: number
  volumeDecimals?: number
}

type Finding = {
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  messageName?: string
  deviceId?: string
}

const nested = (message: DomsJplSimulatorEnvelope) =>
  message.name === 'MultiMessage_resp' && Array.isArray(message.data?.messages)
    ? (message.data.messages as DomsJplSimulatorEnvelope[])
    : []

const flatten = (messages: DomsJplSimulatorEnvelope[]) =>
  messages.flatMap((message) => [message, ...nested(message)])

const hasOwn = (value: unknown, key: string) =>
  Boolean(
    value &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, key),
  )

const isDigits = (value: unknown) => /^\d+$/.test(String(value ?? ''))

export const assessDomsJplLiveConformance = (
  messages: DomsJplSimulatorEnvelope[],
  options: DomsJplLiveConformanceOptions = {},
) => {
  const all = flatten(messages)
  const findings: Finding[] = []
  const fpStatusMessages = all.filter(
    (message) => message.name === 'FpStatus_resp',
  )
  const fuellingDataMessages = all.filter(
    (message) => message.name === 'FpFuellingData_resp',
  )

  const fpStatuses = fpStatusMessages.map((message) => {
    const normalized = normalizeFpStatusPayload(message.data, message.subCode)
    const required = ['FpId', 'FpMainState', 'FpSubStates']
    const missing = required.filter((key) => !hasOwn(message.data, key))
    if (missing.length) {
      findings.push({
        severity: 'error',
        code: 'FP_STATUS_REQUIRED_FIELDS_MISSING',
        message: `FpStatus_resp is missing required fields: ${missing.join(', ')}`,
        messageName: message.name,
        deviceId: normalized.fpId,
      })
    }
    if (!normalized.fpId) {
      findings.push({
        severity: 'error',
        code: 'FP_STATUS_ID_NOT_NORMALIZED',
        message: 'FpStatus_resp did not produce a normalized fpId.',
        messageName: message.name,
      })
    }
    if (!normalized.mainState) {
      findings.push({
        severity: 'error',
        code: 'FP_STATUS_MAIN_STATE_NOT_NORMALIZED',
        message: 'FpStatus_resp did not produce a normalized main state.',
        messageName: message.name,
        deviceId: normalized.fpId,
      })
    }
    return {
      fpId: normalized.fpId ?? null,
      subCode: normalized.subCode ?? null,
      mainState: normalized.mainState ?? null,
      nozzleState: normalized.nozzleState ?? null,
      lockId: normalized.lockId ?? null,
      gradeId: normalized.gradeId ?? null,
      flags: normalized.flags,
      missingRequiredFields: missing,
    }
  })

  if (!fpStatusMessages.length) {
    findings.push({
      severity: 'warning',
      code: 'FP_STATUS_NOT_CAPTURED',
      message:
        'No FpStatus_resp payload was captured for parser conformance review.',
    })
  }

  const valueObservations = fuellingDataMessages.flatMap((message) => {
    const normalized = normalizeFpFuellingDataPayload(
      message.data,
      message.subCode,
    )
    const candidates = [
      [
        'volume',
        normalized.volumeExtended ?? normalized.volume,
        options.volumeDecimals,
      ],
      [
        'money',
        normalized.moneyExtended ?? normalized.money,
        options.moneyDecimals,
      ],
    ] as const
    return candidates.map(([kind, raw, decimals]) => {
      if (raw != null && !isDigits(raw)) {
        findings.push({
          severity: 'error',
          code: 'NON_NUMERIC_JPL_VALUE',
          message: `${kind} value contains non-digit characters: ${raw}`,
          messageName: message.name,
          deviceId: normalized.fpId,
        })
      }
      if (raw != null && decimals == null) {
        findings.push({
          severity: 'warning',
          code: 'DECIMAL_SETTING_NOT_PROVIDED',
          message: `${kind} was captured but cannot be scaled conclusively without an explicit decimal setting.`,
          messageName: message.name,
          deviceId: normalized.fpId,
        })
      }
      return {
        fpId: normalized.fpId ?? null,
        kind,
        raw: raw ?? null,
        decimals: decimals ?? null,
        scaled: raw != null ? scaleByDecimals(raw, decimals) : null,
      }
    })
  })

  if (!fuellingDataMessages.length) {
    findings.push({
      severity: 'warning',
      code: 'FUELLING_DATA_NOT_CAPTURED',
      message:
        'No FpFuellingData_resp payload was captured; money and volume scaling remains unverified.',
    })
  }

  const errorCount = findings.filter(
    (finding) => finding.severity === 'error',
  ).length
  const warningCount = findings.filter(
    (finding) => finding.severity === 'warning',
  ).length

  return {
    status: errorCount ? 'failed' : warningCount ? 'warning' : 'passed',
    summary: {
      capturedMessages: all.length,
      fpStatusMessages: fpStatusMessages.length,
      fuellingDataMessages: fuellingDataMessages.length,
      errorCount,
      warningCount,
      fpStatusParserValidated: fpStatusMessages.length > 0 && errorCount === 0,
      valueNormalizationValidated:
        fuellingDataMessages.length > 0 &&
        options.moneyDecimals != null &&
        options.volumeDecimals != null &&
        errorCount === 0,
    },
    fpStatuses,
    valueObservations,
    findings,
  } as const
}
