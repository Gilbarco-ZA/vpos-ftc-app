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
  name: 'Printer 1',
  connectionType: 'TCP',
  connection: {
    host: '192.168.1.109',
    port: 9100,
  },
  type: 'Epson',
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
  fpIds: [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 19,
    22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
  ],
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
    name: 'Test Station',
    contactName: 'Default Contact',
    contactNumber: 'Default Number',
    contactEmail: 'default@email.com',
  },
})

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
  return Array.from(new Set(out))
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
      host: cfg?.host,
      port: Number(cfg?.port ?? 9100),
      usbPath: cfg?.usbPath,
      serialPath: cfg?.serialPath,
      baudRate: cfg?.baudRate,
    },
  }

  return migrated
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
