export type Json = any

export type DeviceRow = {
  deviceType?: string
  deviceKey?: string
  enabled?: boolean
  schemaVersion?: number
  configJson?: Json
  config_json?: Json
  configJsonText?: string
}

export type PrinterConfig = {
  id?: string
  name?: string

  connectionType?: 'TCP' | 'USB' | 'SERIAL'
  connection?: {
    host?: string
    port?: number
    usbPath?: string
    serialPath?: string
    baudRate?: number
  }

  type?: string
  driver?: string
  driverConfig?: {
    width?: number
    characterSet?: string
    lineCharacter?: string
    removeSpecialCharacters?: boolean
    timeout?: number
    printToConsole?: boolean
    skipPrinter?: boolean
  }

  fpIds?: number[]
  eptId?: number
  heartbeatOn?: boolean
  execTime?: number
  isDefault?: boolean
  online?: boolean
  printDailyReportOnBoot?: boolean
  reprint?: boolean
  waitForResponse?: boolean
  operatorId?: string
  operatorPassword?: string
  orderNo?: string
  stationDetails?: {
    name?: string
    contactName?: string
    contactNumber?: string
    contactEmail?: string
  }

  [k: string]: any
}

export const defaultPrinterConfig = (): PrinterConfig => ({
  id: '0',
  name: 'Receipt printer',
  connectionType: 'TCP',
  connection: {
    host: '',
    port: 9100,
  },
  type: 'Epson compatible',
  driver: 'generic',
  driverConfig: {
    width: 42,
    characterSet: 'SLOVENIA',
    lineCharacter: '-',
    removeSpecialCharacters: false,
    timeout: 1000,
    printToConsole: true,
    skipPrinter: false,
  },
  fpIds: [],
  eptId: 1,
  heartbeatOn: false,
  execTime: 20000,
  isDefault: true,
  online: true,
  printDailyReportOnBoot: false,
  reprint: true,
  waitForResponse: true,
  operatorId: '1',
  operatorPassword: '000000',
  orderNo: '12',
  stationDetails: {
    name: '',
    contactName: '',
    contactNumber: '',
    contactEmail: '',
  },
})

const toFiniteNumber = (value: unknown): number | null => {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : null
}

export function parseFpIds(text: string): number[] {
  const parts = (text || '')
    .split(/[\s,]+/g)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: number[] = []
  for (const p of parts) {
    const n = Number(p)
    if (Number.isFinite(n)) out.push(n)
  }
  return Array.from(new Set(out)).sort((a, b) => a - b)
}

export function normalizeAssignedFpIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => toFiniteNumber(item))
          .filter((item): item is number => item != null && item > 0),
      ),
    ).sort((a, b) => a - b)
  }

  if (typeof value === 'string') return parseFpIds(value)
  return []
}

export function migrateOldPrinterShape(cfg: any): PrinterConfig {
  if (!cfg || typeof cfg !== 'object') return cfg
  const hasNewShape =
    typeof cfg?.connectionType === 'string' || typeof cfg?.driver === 'string'
  if (hasNewShape) return cfg

  const connectionType =
    cfg?.connection === 'usb'
      ? 'USB'
      : cfg?.connection === 'serial'
        ? 'SERIAL'
        : 'TCP'

  const migrated: PrinterConfig = {
    ...cfg,
    connectionType,
    connection: {
      host: cfg?.connection?.host ?? cfg?.host,
      port: Number(cfg?.connection?.port ?? cfg?.port ?? 9100),
      usbPath: cfg?.connection?.usbPath ?? cfg?.usbPath,
      serialPath: cfg?.connection?.serialPath ?? cfg?.serialPath,
      baudRate: cfg?.connection?.baudRate ?? cfg?.baudRate,
    },
  }

  return migrated
}

export function normalizePrinterConfig(cfg: any): PrinterConfig {
  const base = defaultPrinterConfig()
  const migrated = migrateOldPrinterShape(cfg ?? {}) || {}
  const assignedFpIds = normalizeAssignedFpIds(
    migrated?.fpIds ?? migrated?.assignedPumpIds ?? migrated?.pumpIds,
  )

  return {
    ...base,
    ...migrated,
    connectionType:
      migrated?.connectionType === 'USB' ||
      migrated?.connectionType === 'SERIAL'
        ? migrated.connectionType
        : 'TCP',
    connection: {
      ...base.connection,
      ...(migrated?.connection ?? {}),
    },
    driverConfig: {
      ...base.driverConfig,
      ...(migrated?.driverConfig ?? {}),
    },
    fpIds: assignedFpIds,
    stationDetails: {
      ...base.stationDetails,
      ...(migrated?.stationDetails ?? {}),
    },
  }
}

export function normalizeDeviceRow(r: any): DeviceRow {
  const cfg = r?.configJson ?? r?.config_json ?? {}
  return {
    deviceType: r?.deviceType ?? r?.device_type,
    deviceKey: r?.deviceKey ?? r?.device_key,
    enabled: typeof r?.enabled === 'boolean' ? r.enabled : true,
    schemaVersion: Number(r?.schemaVersion ?? r?.schema_version ?? 1),
    configJson: cfg,
  }
}

export function getPrinterDisplayName(
  deviceKey: string,
  printer: PrinterConfig | null | undefined,
) {
  const name = String(printer?.name ?? '').trim()
  return name || deviceKey || 'Printer'
}

export function summarizeAssignedPumps(fpIds: number[] | null | undefined) {
  const ids = normalizeAssignedFpIds(fpIds ?? [])
  if (!ids.length)
    return 'No specific pumps assigned. Used only as a fallback printer.'
  if (ids.length === 1) return `Assigned to pump ${ids[0]}.`
  if (ids.length <= 6) return `Assigned to pumps ${ids.join(', ')}.`
  return `Assigned to ${ids.length} pumps (${ids.slice(0, 6).join(', ')} +${ids.length - 6} more).`
}

export function buildPrinterConnectionPayload(printer: PrinterConfig) {
  return {
    printerKey: String(printer?.id ?? '').trim() || undefined,
    printerIP: String(printer?.connection?.host ?? '').trim() || undefined,
    port: Number(printer?.connection?.port ?? 9100),
    width: Number(printer?.driverConfig?.width ?? 42),
  }
}

export function matchesAssignedPump(
  printer: PrinterConfig | null | undefined,
  pumpId: number,
) {
  return normalizeAssignedFpIds(printer?.fpIds ?? []).includes(Number(pumpId))
}
