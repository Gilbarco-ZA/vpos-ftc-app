import { toNumberStrict as toNumber } from '@/src/shared/numbers'
import { pickString } from '@/src/shared/strings'

export type PrinterConnectionConfig = {
  host: string
  port?: number
  width?: number
  timeoutMs?: number
}

export function parsePrinterDeviceConfig(
  configJson: Record<string, unknown> | null | undefined,
): PrinterConnectionConfig | null {
  if (!configJson || typeof configJson !== 'object') return null

  const cfg = configJson as any
  const connection = cfg?.connection ?? {}
  const driverConfig = cfg?.driverConfig ?? {}

  const host = pickString(
    connection?.host,
    cfg?.host,
    cfg?.printerIP,
    cfg?.printerIp,
    cfg?.ip,
  )

  if (!host) return null

  const port = toNumber(connection?.port ?? cfg?.port) ?? undefined
  const width = toNumber(driverConfig?.width ?? cfg?.width) ?? undefined
  const timeoutMs =
    toNumber(driverConfig?.timeout ?? cfg?.timeoutMs ?? cfg?.timeout) ??
    undefined

  return {
    host,
    port,
    width,
    timeoutMs,
  }
}
