export type ImportContext = {
  runId: string
  moveAsideRoot: string
  sourceType: 'vpos-app' | 'vpos-console' | 'unknown'
}

export type ImportResult = {
  inserted: Record<string, number>
  skipped: Record<string, number>
  moved: Record<string, number>
  warnings: string[]
}

export const LEGACY = {
  FOLDERS: {
    TRANSACTIONS: 'transactions',
    PENDING_TRANSACTIONS: 'pending-transactions',
    REPORTS: 'reports',
    EWURA_REPORTS: 'ewura-reports',
    EWURA_TRANSACTIONS: 'ewura-transactions',
  },
  FILES: {
    TRANSACTION_QUEUE: 'fiscal.transaction.queue.json',
    REPORT_QUEUE: 'fiscal.report.queue.json',
    EWURA_CONFIG: 'ewura.config.json',
    EWURA_REGISTRATION: 'ewura.registration.json',
    EWURA_REPORTS_QUEUE: 'ewura.reports.json',
    EWURA_TRANSACTIONS_QUEUE: 'ewura.transactions.json',
  },
}

export const LEGACY_EXTRA = {
  CERT_DIR: 'cert',
  CERT_PFX: 'certificate.pfx',
  CERT_PASS: 'certificate.pass',
  FISCAL_DEVICE: 'fiscal.device.json',
  FISCAL_TOKEN: 'fiscal.token.json',
  PRINTER_TRANSACTION_QUEUE: 'printer.transaction.queue.json',
  PRINTER_REPORT_QUEUE: 'printer.report.queue.json',
  REMOTE_UPLOAD_QUEUE: 'remote.upload.queue.json',
  REMOTE_UPLOAD_STATUS: 'remote.upload.status.json',
}

export const ARCHIVE_ROOT = 'legacy-archive'

export const VPOS_APP_FILES = {
  USERS: 'users.config.json',
  VPOS_CONFIG: 'vpos.config.json',
  ENGINE_CONFIG: 'engine.config.json',
  REMOTE: 'vpos.remote.json',
  FISCAL_CONFIG: 'fiscal.config.json',
  FISCAL_REGISTRATION: 'fiscal.registration.json',
}

export const VPOS_CONSOLE_MONOLITH = {
  TRANSACTIONS: 'fiscal.transactions.json',
  REPORTS: 'fiscal.reports.json',
}
