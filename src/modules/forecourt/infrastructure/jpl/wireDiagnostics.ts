import { Socket } from 'node:net'

import { writeJplTrafficLog } from '@/src/modules/forecourt/infrastructure/jpl/logging'
import { syncAdapterState } from '@/src/modules/forecourt/infrastructure/jpl/persistence'
import {
  JPL_ETX,
  JPL_STX,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/framing'
import { redactJplSensitivePaymentData } from '@/src/modules/forecourt/infrastructure/jpl/unattendedTransactions'

const TARGET_OUTBOUND_NAMES = new Set([
  'FpSupTrans_req',
  'FpSupTransBufStatus_req',
  'clear_FpSupTrans_req',
  'unlock_FpSupTrans_req',
])

const TARGET_INBOUND_NAMES = new Set([
  'FpSupTrans_resp',
  'FpSupTransBufStatus_resp',
  'RejectMessage_resp',
  'clear_FpSupTrans_resp',
  'unlock_FpSupTrans_resp',
  'FcServiceMsg_resp',
])

const MAX_BUFFER_BYTES = 64 * 1024
const MAX_HEX_BYTES = 4 * 1024

export type JplWireDiagnostic = {
  direction: 'send' | 'recv'
  captureLayer: 'socket'
  name: string
  subCode?: string
  correlationId?: unknown
  solicited?: boolean
  chunkByteLength: number
  frameByteLength: number
  jsonByteLength: number
  hasStx: boolean
  hasEtx: boolean
  stxIndex: number
  etxIndex: number
  frameHex?: string
  frameUtf8?: string
  frameHexTruncated?: boolean
  rawFrameOmittedReason?: string
  envelope: unknown
  remoteAddress?: string
  remotePort?: number
  localPort?: number
  at: number
}

type Registration = {
  token: symbol
  stationId: string
  port: number
}

type SocketCapture = {
  socket: Socket
  registrationToken: symbol
  handler: (chunk: Buffer) => void
  pending: Buffer
}

const registrations = new Map<symbol, Registration>()
const socketCaptures = new Set<SocketCapture>()
const outboundPending = new WeakMap<Socket, Buffer>()
const lastRecordedAtBySignature = new Map<string, number>()
let originalSocketWrite: any = null
let socketWriteWasOwn = false

const toBuffer = (chunk: unknown, encoding?: unknown): Buffer | null => {
  if (Buffer.isBuffer(chunk)) return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk)
  if (typeof chunk === 'string') {
    return Buffer.from(
      chunk,
      typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8',
    )
  }
  return null
}

const trimPending = (value: Buffer) =>
  value.length <= MAX_BUFFER_BYTES
    ? value
    : value.subarray(value.length - MAX_BUFFER_BYTES)

const extractFrames = (pending: Buffer) => {
  const frames: Buffer[] = []
  let cursor = 0

  while (cursor < pending.length) {
    const stx = pending.indexOf(JPL_STX, cursor)
    if (stx < 0) break
    const etx = pending.indexOf(JPL_ETX, stx + 1)
    if (etx < 0) {
      return {
        frames,
        remaining: trimPending(pending.subarray(stx)),
      }
    }

    frames.push(pending.subarray(stx, etx + 1))
    cursor = etx + 1
  }

  return {
    frames,
    remaining: Buffer.alloc(0),
  }
}

const parseEnvelope = (frame: Buffer) => {
  const stxIndex = frame.indexOf(JPL_STX)
  const etxIndex = frame.lastIndexOf(JPL_ETX)
  const jsonBuffer =
    stxIndex >= 0 && etxIndex > stxIndex
      ? frame.subarray(stxIndex + 1, etxIndex)
      : frame

  try {
    const envelope = JSON.parse(jsonBuffer.toString('utf8'))
    if (!envelope || typeof envelope !== 'object') return null
    const name = String((envelope as any).name ?? '').trim()
    if (!name) return null
    return { envelope, name, jsonBuffer, stxIndex, etxIndex }
  } catch {
    return null
  }
}

const isTargetName = (direction: 'send' | 'recv', name: string) =>
  direction === 'send'
    ? TARGET_OUTBOUND_NAMES.has(name)
    : TARGET_INBOUND_NAMES.has(name)

export const inspectJplWireFrame = (args: {
  frame: Buffer
  direction: 'send' | 'recv'
  chunkByteLength?: number
  socket?: Pick<Socket, 'remoteAddress' | 'remotePort' | 'localPort'>
}): JplWireDiagnostic | null => {
  const parsed = parseEnvelope(args.frame)
  if (!parsed || !isTargetName(args.direction, parsed.name)) return null

  const envelope = redactJplSensitivePaymentData(parsed.envelope)
  const hexSource = args.frame.subarray(0, MAX_HEX_BYTES)
  const subCode = String((parsed.envelope as any).subCode ?? '').trim()
  const rawFrameSafe =
    args.direction === 'send' ||
    parsed.name === 'RejectMessage_resp' ||
    parsed.name === 'clear_FpSupTrans_resp' ||
    parsed.name === 'unlock_FpSupTrans_resp'

  return {
    direction: args.direction,
    captureLayer: 'socket',
    name: parsed.name,
    subCode: subCode || undefined,
    correlationId: (parsed.envelope as any).correlationId,
    solicited:
      typeof (parsed.envelope as any).solicited === 'boolean'
        ? (parsed.envelope as any).solicited
        : undefined,
    chunkByteLength: args.chunkByteLength ?? args.frame.length,
    frameByteLength: args.frame.length,
    jsonByteLength: parsed.jsonBuffer.length,
    hasStx: parsed.stxIndex >= 0,
    hasEtx: parsed.etxIndex >= 0,
    stxIndex: parsed.stxIndex,
    etxIndex: parsed.etxIndex,
    ...(rawFrameSafe
      ? {
          frameHex: hexSource.toString('hex'),
          frameUtf8: args.frame
            .toString('utf8')
            .replace(/\x02/g, '<STX>')
            .replace(/\x03/g, '<ETX>'),
          frameHexTruncated: args.frame.length > MAX_HEX_BYTES,
        }
      : {
          rawFrameOmittedReason:
            'Raw inbound transaction payload omitted to avoid exposing payment data; redacted envelope and byte lengths retained.',
        }),
    envelope,
    remoteAddress: args.socket?.remoteAddress,
    remotePort: args.socket?.remotePort,
    localPort: args.socket?.localPort,
    at: Date.now(),
  }
}

const diagnosticSignature = (diagnostic: JplWireDiagnostic) => {
  const data = (diagnostic.envelope as any)?.data ?? {}
  return [
    diagnostic.direction,
    diagnostic.name,
    diagnostic.subCode ?? '',
    data?.FpId ?? '',
    data?.TransSeqNo ?? '',
    data?.RejectedExtendedMsgCode ?? '',
    data?.RejectedMsgSubc ?? '',
    data?.RejectInfo ?? '',
  ].join(':')
}

const recordDiagnostic = (
  registration: Registration,
  diagnostic: JplWireDiagnostic,
) => {
  const signature = diagnosticSignature(diagnostic)
  const previous = lastRecordedAtBySignature.get(signature) ?? 0
  if (diagnostic.at - previous < 1_000) return
  lastRecordedAtBySignature.set(signature, diagnostic.at)

  const state = (globalThis as any).__jplWireDiagnostics as
    | JplWireDiagnostic[]
    | undefined
  const recent = [diagnostic, ...(state ?? [])].slice(0, 20)
  ;(globalThis as any).__jplWireDiagnostics = recent

  syncAdapterState(registration.stationId, {
    lastWireDiagnostic: diagnostic,
    wireDiagnostics: recent,
  } as any)

  const suffix = diagnostic.subCode
    ? `${diagnostic.name}_${diagnostic.subCode}`
    : diagnostic.name
  writeJplTrafficLog(
    registration.stationId,
    diagnostic.direction,
    `wire:${diagnostic.direction}:${suffix}`,
    diagnostic,
  )
}

const registrationForSocket = (socket: Socket, buffer: Buffer) => {
  const remotePort = Number(socket.remotePort)
  const byPort = [...registrations.values()].find(
    (registration) => registration.port === remotePort,
  )
  if (byPort) return byPort

  if (registrations.size !== 1) return null
  const text = buffer.toString('utf8')
  const looksLikeTargetJpl =
    text.includes('FpSupTrans') ||
    text.includes('clear_FpSupTrans') ||
    text.includes('unlock_FpSupTrans')
  return looksLikeTargetJpl ? [...registrations.values()][0] : null
}

const ensureInboundCapture = (socket: Socket, registration: Registration) => {
  const existing = [...socketCaptures].find(
    (capture) =>
      capture.socket === socket &&
      capture.registrationToken === registration.token,
  )
  if (existing) return

  const capture: SocketCapture = {
    socket,
    registrationToken: registration.token,
    handler: () => undefined,
    pending: Buffer.alloc(0),
  }

  capture.handler = (chunk: Buffer) => {
    const buffer = toBuffer(chunk)
    if (!buffer) return
    capture.pending = trimPending(Buffer.concat([capture.pending, buffer]))
    const extracted = extractFrames(capture.pending)
    capture.pending = extracted.remaining

    for (const frame of extracted.frames) {
      const diagnostic = inspectJplWireFrame({
        frame,
        direction: 'recv',
        chunkByteLength: buffer.length,
        socket,
      })
      if (diagnostic) recordDiagnostic(registration, diagnostic)
    }
  }

  socket.on('data', capture.handler)
  socketCaptures.add(capture)
}

const installSocketWriteHook = () => {
  if (originalSocketWrite) return
  socketWriteWasOwn = Object.prototype.hasOwnProperty.call(
    Socket.prototype,
    'write',
  )
  originalSocketWrite = (Socket.prototype as any).write
  ;(Socket.prototype as any).write = function patchedJplDiagnosticWrite(
    this: Socket,
    chunk: unknown,
    ...args: any[]
  ) {
    try {
      const buffer = toBuffer(chunk, args[0])
      const registration = buffer ? registrationForSocket(this, buffer) : null
      if (registration && buffer) {
        const current = outboundPending.get(this) ?? Buffer.alloc(0)
        const pending = trimPending(Buffer.concat([current, buffer]))
        const extracted = extractFrames(pending)
        outboundPending.set(this, extracted.remaining)

        for (const frame of extracted.frames) {
          const diagnostic = inspectJplWireFrame({
            frame,
            direction: 'send',
            chunkByteLength: buffer.length,
            socket: this,
          })
          if (!diagnostic) continue
          ensureInboundCapture(this, registration)
          recordDiagnostic(registration, diagnostic)
        }

        if (extracted.frames.length === 0) {
          const trimmed = buffer.toString('utf8').trim()
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const diagnostic = inspectJplWireFrame({
              frame: buffer,
              direction: 'send',
              chunkByteLength: buffer.length,
              socket: this,
            })
            if (diagnostic) {
              ensureInboundCapture(this, registration)
              recordDiagnostic(registration, diagnostic)
            }
          }
        }
      }
    } catch {
      // Diagnostics must never interfere with the forecourt socket.
    }

    return originalSocketWrite.call(this, chunk, ...args)
  }
}

const uninstallSocketWriteHookIfUnused = () => {
  if (registrations.size > 0 || !originalSocketWrite) return
  if (socketWriteWasOwn) {
    ;(Socket.prototype as any).write = originalSocketWrite
  } else {
    delete (Socket.prototype as any).write
  }
  originalSocketWrite = null
  socketWriteWasOwn = false

  for (const capture of socketCaptures) {
    try {
      capture.socket.off('data', capture.handler)
    } catch {
      // ignore cleanup failures
    }
  }
  socketCaptures.clear()
}

export const installJplWireDiagnostics = (args: {
  stationId: string
  port: number
}) => {
  const token = Symbol(`jpl-wire:${args.stationId}`)
  registrations.set(token, {
    token,
    stationId: args.stationId,
    port: args.port,
  })
  installSocketWriteHook()

  return () => {
    registrations.delete(token)
    for (const capture of [...socketCaptures]) {
      if (capture.registrationToken !== token) continue
      try {
        capture.socket.off('data', capture.handler)
      } catch {
        // ignore cleanup failures
      }
      socketCaptures.delete(capture)
    }
    uninstallSocketWriteHookIfUnused()
  }
}
