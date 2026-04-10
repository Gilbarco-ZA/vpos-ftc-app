/**
 * Legacy process name compatibility for vpos-app runbooks + vpos-console tooling.
 * Keys are normalized (lower-cased, trimmed); values are canonical names used by FTC.
 */
export const PROCESS_NAME_ALIASES: Record<string, string> = {
  // canonical self-maps (case-insensitive)
  api: 'api',

  // core workers (case-insensitive)
  poscommandsworker: 'posCommandsWorker',
  transactionqueueworker: 'transactionQueueWorker',
  printjobsworker: 'printJobsWorker',
  reportqueueworker: 'reportQueueWorker',
  proxysenderworker: 'proxySenderWorker',
  transactionfiscalizationscheduler: 'transactionFiscalizationScheduler',
  archiveexportworker: 'archiveExportWorker',

  // common legacy/runbook variants
  'pos-commands': 'posCommandsWorker',
  'pos-commands-worker': 'posCommandsWorker',
  poscommandworker: 'posCommandsWorker',
  poscommands: 'posCommandsWorker',
  commandworker: 'posCommandsWorker',

  'transaction-queue': 'transactionQueueWorker',
  'transaction-queue-worker': 'transactionQueueWorker',
  txworker: 'transactionQueueWorker',
  transactionworker: 'transactionQueueWorker',
  transactionsworker: 'transactionQueueWorker',

  'print-jobs': 'printJobsWorker',
  'print-jobs-worker': 'printJobsWorker',
  printworker: 'printJobsWorker',
  printerworker: 'printJobsWorker',

  'report-queue': 'reportQueueWorker',
  'report-queue-worker': 'reportQueueWorker',
  reportworker: 'reportQueueWorker',
  reportsworker: 'reportQueueWorker',

  proxy: 'proxySenderWorker',
  'proxy-sender': 'proxySenderWorker',
  proxysender: 'proxySenderWorker',
  proxyworker: 'proxySenderWorker',

  scheduler: 'transactionFiscalizationScheduler',
  fiscalizationscheduler: 'transactionFiscalizationScheduler',
  'transaction-fiscalization-scheduler': 'transactionFiscalizationScheduler',

  archive: 'archiveExportWorker',
  'archive-export': 'archiveExportWorker',
  'archive-export-worker': 'archiveExportWorker',
  archiver: 'archiveExportWorker',
}

/**
 * Core worker process names that are always exposed by supervisor status,
 * even if not listed in the system configuration.
 */
export const CORE_PROCESS_NAMES = [
  'posCommandsWorker',
  'transactionQueueWorker',
  'printJobsWorker',
  'reportQueueWorker',
  'proxySenderWorker',
  'transactionFiscalizationScheduler',
  'archiveExportWorker',
] as const

export function normalizeProcessKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
}

export function canonicalizeProcessName(name: string): string {
  const key = normalizeProcessKey(name)
  return PROCESS_NAME_ALIASES[key] ?? String(name || '').trim()
}

export function buildProcessAliasIndex(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [alias, canonical] of Object.entries(PROCESS_NAME_ALIASES)) {
    const canonicalKey = normalizeProcessKey(canonical)
    if (alias === canonicalKey) continue
    if (!out[canonical]) out[canonical] = []
    out[canonical].push(alias)
  }
  for (const k of Object.keys(out)) out[k].sort()
  return out
}

/**
 * Ensure `names` includes all core process names.
 * Mutates the array in-place and returns it.
 */
export function ensureCoreProcessNames(names: string[]): string[] {
  for (const core of CORE_PROCESS_NAMES) {
    if (!names.includes(core)) names.push(core)
  }
  return names
}
