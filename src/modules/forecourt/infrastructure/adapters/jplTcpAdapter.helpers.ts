import util from 'util'
import type { DomainEvent } from '@gilbarcoafs/doms-pos-jpl'

import { PUMP_NOZZLE_STATE } from '@/src/shared/status'

export const serializeError = (err: unknown) => {
  if (!err) return { message: '' }

  if (err instanceof Error) {
    const anyErr = err as any
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: anyErr.code,
      errno: anyErr.errno,
      syscall: anyErr.syscall,
      address: anyErr.address,
      port: anyErr.port,
      cause: anyErr.cause ? String(anyErr.cause) : undefined,
    }
  }

  if (typeof err === 'object') {
    const anyErr = err as any
    return {
      message: anyErr?.message ? String(anyErr.message) : String(err),
      stack: anyErr?.stack ? String(anyErr.stack) : undefined,
      code: anyErr?.code,
      errno: anyErr?.errno,
      syscall: anyErr?.syscall,
      address: anyErr?.address,
      port: anyErr?.port,
    }
  }

  return { message: String(err) }
}

export const serializeForLog = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value instanceof Error)
    return value.stack || `${value.name}: ${value.message}`
  return util.inspect(value, {
    depth: 8,
    colors: false,
    maxArrayLength: 200,
    breakLength: 140,
    compact: false,
  })
}

export const padId2 = (value: unknown) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return String(value ?? '')
  const s = String(Math.trunc(n))
  return s.length >= 2 ? s : s.padStart(2, '0')
}

export const mapJplMainState = (value: unknown) => {
  const unwrap = (v: any): string => {
    if (v == null) return ''

    if (typeof v === 'object') {
      const enumObj = (v as any).enum
      const vv = (v as any).value

      if (enumObj && typeof enumObj === 'object') {
        if (typeof vv === 'string') {
          const matchKey = Object.keys(enumObj).find((k) => enumObj[k] === vv)
          if (matchKey) return matchKey
        }
        const keys = Object.keys(enumObj)
        if (keys.length) return keys[0]
      }

      if (typeof vv === 'string') return vv
    }

    return String(v)
  }

  const raw = unwrap(value).trim().toLowerCase()

  if (!raw) return PUMP_NOZZLE_STATE.IDLE
  if (raw.includes('unconfigured')) return PUMP_NOZZLE_STATE.UNCONFIGURED
  if (raw.includes('unavailable')) return PUMP_NOZZLE_STATE.UNAVAILABLE
  if (raw.includes('closed')) return PUMP_NOZZLE_STATE.CLOSED
  if (raw.includes('error')) return PUMP_NOZZLE_STATE.ERROR
  if (
    raw.includes('terminated') ||
    raw.includes('final') ||
    raw.includes('stopped')
  )
    return PUMP_NOZZLE_STATE.NOZZLE_DOWN
  if (raw.includes('preauthorized') || raw.includes('authorized'))
    return PUMP_NOZZLE_STATE.PREAUTHORIZED
  if (raw.includes('calling') || raw === 'call')
    return PUMP_NOZZLE_STATE.CALLING
  if (raw.includes('starting')) return PUMP_NOZZLE_STATE.STARTING
  if (
    raw.includes('fuelling_paused') ||
    raw.includes('fueling_paused') ||
    raw.includes('dispensing_paused')
  ) {
    return PUMP_NOZZLE_STATE.DISPENSING_PAUSED
  }
  if (
    raw.includes('fuelling') ||
    raw.includes('fueling') ||
    raw.includes('dispens')
  ) {
    return PUMP_NOZZLE_STATE.DISPENSING
  }
  if (raw.includes('idle')) {
    return PUMP_NOZZLE_STATE.IDLE
  }

  if (/^[0-9a-f]{2}h$/.test(raw)) return PUMP_NOZZLE_STATE.IDLE

  return raw
}

export const extractNozzleNumber = (payload: any): number | null => {
  const v =
    payload?.NozzleNumber ??
    payload?.nozzleNumber ??
    payload?.NozzleNo ??
    payload?.nozzleNo ??
    payload?.Nozzle ??
    payload?.nozzle
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export const extractSubCode = (payload: any): string | null => {
  const v = payload?.SubCode ?? payload?.subCode ?? payload?.subcode
  if (!v) return null
  const s = String(v).trim()
  return s ? s : null
}

export const eventTypeFromDomainEvent = (evt: DomainEvent) => {
  const base = String(evt?.name ?? '').trim()
  const sc = extractSubCode(evt?.payload)
  if (!sc) return base
  if (base.endsWith(`_${sc}`)) return base
  if (base.includes('_resp_') || base.includes('_req_')) return base
  return `${base}_${sc}`
}

export const unwrapMultiMessage = (
  eventType: string,
  payload: any,
): any[] | null => {
  if (!payload || typeof payload !== 'object') return null
  const isMulti =
    eventType.startsWith('MultiMessage_resp') ||
    eventType.startsWith('MultiMessage_') ||
    payload?.MultiMessage != null ||
    Array.isArray(payload?.messages) ||
    Array.isArray(payload?.Messages) ||
    Array.isArray(payload?.Message)

  if (!isMulti) return null

  const candidates = []
  if (Array.isArray(payload?.messages)) candidates.push(...payload.messages)
  if (Array.isArray(payload?.Messages)) candidates.push(...payload.Messages)
  if (Array.isArray(payload?.Message)) candidates.push(...payload.Message)
  if (Array.isArray(payload?.MultiMessage))
    candidates.push(...payload.MultiMessage)
  if (Array.isArray(payload?.Msgs)) candidates.push(...payload.Msgs)

  const decoded: any[] = []
  for (const m of candidates) {
    const name = m?.name ?? m?.Name ?? m?.MsgName ?? m?.msgName
    const subCode = m?.subCode ?? m?.SubCode ?? m?.subcode
    const data = m?.data ?? m?.Data ?? m?.payload ?? m?.Payload ?? m
    if (name) {
      decoded.push({
        __eventType: `${String(name)}_${String(subCode ?? '').trim()}`,
        payload: data,
      })
    } else if (data && typeof data === 'object' && (data.name || data.Name)) {
      decoded.push({
        __eventType: `${String(data.name ?? data.Name)}_${String(data.subCode ?? data.SubCode ?? '').trim()}`,
        payload: data.data ?? data.Data ?? {},
      })
    }
  }

  return decoded.length ? decoded : null
}

export const resolveTransSeqNo = (tx: any): number | null => {
  const candidates: any[] = [
    tx?.transSeqNo,
    tx?.transSeq,
    tx?.sequenceNo,
    tx?.raw?.TransSeqNo,
    tx?.raw?.TransSeqNo_e,
    tx?.raw?.TransSeqNo_E,
    tx?.raw?.TransInSupBuffer?.[0]?.TransSeqNo,
    tx?.raw?.TransInUnSupBuffer?.[0]?.TransSeqNo,
    tx?.raw?.TransInSupBuffer?.[0]?.TransSeqNo_e,
    tx?.raw?.TransInUnSupBuffer?.[0]?.TransSeqNo_e,
    tx?.item?.TransSeqNo,
    tx?.transaction?.TransSeqNo,
    tx?.transaction?.transSeqNo,
  ]

  for (const v of candidates) {
    if (v == null) continue
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

export const toJplDecimalString = (value: unknown, fallback = '0') => {
  if (value == null) return fallback
  const s = String(value).trim()
  return s.length > 0 ? s : fallback
}

const firstNonBlank = (...values: unknown[]) => {
  for (const value of values) {
    if (value == null) continue
    const s = String(value).trim()
    if (s) return s
  }
  return null
}

export const leftPadDigits = (
  value: unknown,
  length: number,
  fallback = '0',
) => {
  const s = toJplDecimalString(value, fallback).replace(/\D/g, '')
  return (s || fallback).padStart(length, '0')
}

export const getSupervisedTxClearFields = (txData: any) => {
  const tp = txData?.TransPars ?? txData?.transPars ?? {}

  const volE = firstNonBlank(
    tp?.Vol_e,
    txData?.Vol_e,
    tp?.Volume_e,
    txData?.Volume_e,
  )

  const moneyE = firstNonBlank(
    tp?.Money_e,
    txData?.Money_e,
    tp?.MoneyDue_e,
    txData?.MoneyDue_e,
  )

  const volStd = firstNonBlank(tp?.Vol, txData?.Vol, tp?.Volume, txData?.Volume)
  const moneyStd = firstNonBlank(
    tp?.Money,
    txData?.Money,
    tp?.MoneyDue,
    txData?.MoneyDue,
  )

  return {
    Vol_e: volE ? String(volE) : leftPadDigits(volStd, 10, '0'),
    Money_e: moneyE ? String(moneyE) : leftPadDigits(moneyStd, 10, '0'),
  }
}
