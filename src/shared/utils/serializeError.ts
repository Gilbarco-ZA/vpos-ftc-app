export type SerializedError = {
  name?: string
  message: string
  stack?: string
  code?: string | number
  errno?: string | number
  syscall?: string
  address?: string
  port?: string | number
  status?: string | number
  cause?: SerializedError | string
}

const readRecordField = (value: Record<string, unknown>, key: string) =>
  value[key]

const optionalText = (value: unknown) => {
  if (value == null) return undefined
  const text = String(value).trim()
  return text || undefined
}

const optionalScalar = (value: unknown): string | number | undefined => {
  if (typeof value === 'string' || typeof value === 'number') return value
  return undefined
}

/**
 * Convert native Error objects and common driver/network errors into a shape
 * that survives JSON logging. The output is intentionally bounded and avoids
 * copying arbitrary error properties that may contain credentials or payloads.
 */
export function serializeError(error: unknown, depth = 0): SerializedError {
  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>
    const cause = readRecordField(record, 'cause')
    return {
      name: optionalText(error.name),
      message: error.message || String(error),
      stack: optionalText(error.stack),
      code: optionalScalar(readRecordField(record, 'code')),
      errno: optionalScalar(readRecordField(record, 'errno')),
      syscall: optionalText(readRecordField(record, 'syscall')),
      address: optionalText(readRecordField(record, 'address')),
      port: optionalScalar(readRecordField(record, 'port')),
      status: optionalScalar(
        readRecordField(record, 'status') ??
          readRecordField(record, 'statusCode'),
      ),
      cause:
        cause == null
          ? undefined
          : depth >= 1
            ? optionalText(cause)
            : serializeError(cause, depth + 1),
    }
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const cause = readRecordField(record, 'cause')
    return {
      name: optionalText(readRecordField(record, 'name')),
      message:
        optionalText(readRecordField(record, 'message')) ??
        optionalText(readRecordField(record, 'error')) ??
        '[object error]',
      stack: optionalText(readRecordField(record, 'stack')),
      code: optionalScalar(readRecordField(record, 'code')),
      errno: optionalScalar(readRecordField(record, 'errno')),
      syscall: optionalText(readRecordField(record, 'syscall')),
      address: optionalText(readRecordField(record, 'address')),
      port: optionalScalar(readRecordField(record, 'port')),
      status: optionalScalar(
        readRecordField(record, 'status') ??
          readRecordField(record, 'statusCode'),
      ),
      cause:
        cause == null
          ? undefined
          : depth >= 1
            ? optionalText(cause)
            : serializeError(cause, depth + 1),
    }
  }

  return { message: error == null ? '' : String(error) }
}
