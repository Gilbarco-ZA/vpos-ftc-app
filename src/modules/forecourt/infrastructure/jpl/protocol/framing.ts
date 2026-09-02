export const JPL_STX = 0x02
export const JPL_ETX = 0x03

export type JplFrameDiagnosticCode =
  | 'ok'
  | 'empty_frame'
  | 'missing_stx'
  | 'missing_etx'
  | 'stx_after_etx'
  | 'json_parse_error'
  | 'invalid_envelope'
  | 'unsupported_frame_type'

export type JplFrameDiagnostic = {
  valid: boolean
  code: JplFrameDiagnosticCode
  message: string
  byteLength: number
  hasStx: boolean
  hasEtx: boolean
  stxIndex: number
  etxIndex: number
  preview: string
  name?: string
  subCode?: string
  solicited?: boolean
  correlationId?: unknown
  at: number
}

const MAX_PREVIEW_BYTES = 240

const toBuffer = (frame: unknown): Buffer | null => {
  if (Buffer.isBuffer(frame)) return frame
  if (frame instanceof Uint8Array) return Buffer.from(frame)
  if (typeof frame === 'string') return Buffer.from(frame, 'utf8')
  if (frame && typeof frame === 'object') {
    const candidate =
      (frame as any).frame ?? (frame as any).raw ?? (frame as any).data
    if (candidate !== frame) return toBuffer(candidate)
  }
  return null
}

const previewFrame = (buffer: Buffer) =>
  buffer
    .subarray(0, MAX_PREVIEW_BYTES)
    .toString('utf8')
    .replace(/[\u0000-\u001f\u007f]/g, (char) => {
      const code = char.charCodeAt(0)
      if (code === JPL_STX) return '<STX>'
      if (code === JPL_ETX) return '<ETX>'
      if (char === '\n') return '\\n'
      if (char === '\r') return '\\r'
      if (char === '\t') return '\\t'
      return `\\x${code.toString(16).toUpperCase().padStart(2, '0')}`
    })

const hasValidDecodedEnvelope = (parsed: any) => {
  const name = String(parsed?.name ?? '').trim()
  const subCode = String(parsed?.subCode ?? '').trim()
  const data = parsed?.data
  const rejectWithoutSubCode = name === 'RejectMessage_resp' && !subCode

  return Boolean(
    name &&
    data != null &&
    typeof data === 'object' &&
    (subCode || rejectWithoutSubCode),
  )
}

const buildDiagnostic = (
  args: Omit<
    JplFrameDiagnostic,
    'at' | 'valid' | 'hasStx' | 'hasEtx' | 'byteLength' | 'preview'
  > & {
    buffer: Buffer
    valid: boolean
  },
): JplFrameDiagnostic => ({
  valid: args.valid,
  code: args.code,
  message: args.message,
  byteLength: args.buffer.length,
  hasStx: args.stxIndex >= 0,
  hasEtx: args.etxIndex >= 0,
  stxIndex: args.stxIndex,
  etxIndex: args.etxIndex,
  preview: previewFrame(args.buffer),
  name: args.name,
  subCode: args.subCode,
  solicited: args.solicited,
  correlationId: args.correlationId,
  at: Date.now(),
})

export const inspectJplFrame = (frame: unknown): JplFrameDiagnostic => {
  const buffer = toBuffer(frame)
  if (!buffer) {
    return {
      valid: false,
      code: 'unsupported_frame_type',
      message: 'JPL frame diagnostic received an unsupported frame value',
      byteLength: 0,
      hasStx: false,
      hasEtx: false,
      stxIndex: -1,
      etxIndex: -1,
      preview: String(frame ?? ''),
      at: Date.now(),
    }
  }

  const stxIndex = buffer.indexOf(JPL_STX)
  const etxIndex = buffer.lastIndexOf(JPL_ETX)

  if (buffer.length === 0) {
    return buildDiagnostic({
      buffer,
      valid: false,
      code: 'empty_frame',
      message: 'JPL frame is empty',
      stxIndex,
      etxIndex,
    })
  }

  if (stxIndex < 0 && etxIndex < 0) {
    // doms-pos-jpl emits `rawFrame` after its STX/ETX framer has removed the
    // transport delimiters. Treat a complete JSON JPL envelope as valid
    // decoded frame data instead of reporting a false missing_stx warning.
    const jsonText = buffer.toString('utf8').trim()
    if (jsonText.startsWith('{') && jsonText.endsWith('}')) {
      try {
        const parsed = JSON.parse(jsonText)
        const name = parsed?.name
        const subCode = parsed?.subCode
        if (hasValidDecodedEnvelope(parsed)) {
          return buildDiagnostic({
            buffer,
            valid: true,
            code: 'ok',
            message:
              'Decoded JPL JSON envelope is valid; STX/ETX delimiters were removed by the transport framer',
            stxIndex,
            etxIndex,
            name: String(name),
            subCode: subCode ? String(subCode).trim().toUpperCase() : undefined,
            solicited:
              typeof parsed?.solicited === 'boolean'
                ? parsed.solicited
                : undefined,
            correlationId: parsed?.correlationId,
          })
        }
      } catch {
        // Fall through to the transport-level missing STX diagnostic.
      }
    }
  }

  if (stxIndex < 0) {
    return buildDiagnostic({
      buffer,
      valid: false,
      code: 'missing_stx',
      message: 'JPL frame is missing the STX delimiter octet',
      stxIndex,
      etxIndex,
    })
  }

  if (etxIndex < 0) {
    return buildDiagnostic({
      buffer,
      valid: false,
      code: 'missing_etx',
      message: 'JPL frame is missing the ETX delimiter octet',
      stxIndex,
      etxIndex,
    })
  }

  if (stxIndex >= etxIndex) {
    return buildDiagnostic({
      buffer,
      valid: false,
      code: 'stx_after_etx',
      message: 'JPL frame delimiters are out of order',
      stxIndex,
      etxIndex,
    })
  }

  const jsonText = buffer.subarray(stxIndex + 1, etxIndex).toString('utf8')
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    return buildDiagnostic({
      buffer,
      valid: false,
      code: 'json_parse_error',
      message:
        err instanceof Error
          ? err.message
          : 'JPL frame JSON could not be parsed',
      stxIndex,
      etxIndex,
    })
  }

  const name = parsed?.name
  const subCode = parsed?.subCode
  if (!hasValidDecodedEnvelope(parsed)) {
    return buildDiagnostic({
      buffer,
      valid: false,
      code: 'invalid_envelope',
      message: 'JPL frame JSON is missing name, subCode, or data object',
      stxIndex,
      etxIndex,
      name: name ? String(name) : undefined,
      subCode: subCode ? String(subCode) : undefined,
      solicited:
        typeof parsed?.solicited === 'boolean' ? parsed.solicited : undefined,
      correlationId: parsed?.correlationId,
    })
  }

  return buildDiagnostic({
    buffer,
    valid: true,
    code: 'ok',
    message: 'JPL frame delimiters and JSON envelope are valid',
    stxIndex,
    etxIndex,
    name: String(name),
    subCode: subCode ? String(subCode).trim().toUpperCase() : undefined,
    solicited:
      typeof parsed?.solicited === 'boolean' ? parsed.solicited : undefined,
    correlationId: parsed?.correlationId,
  })
}
