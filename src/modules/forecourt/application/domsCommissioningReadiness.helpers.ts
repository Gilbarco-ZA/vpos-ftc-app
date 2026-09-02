import type { ForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

export type DomsCommissioningStatus =
  | 'ready'
  | 'ready-with-warnings'
  | 'blocked'

export type DomsCommissioningSeverity = 'pass' | 'warn' | 'block'

export type DomsCommissioningCheck = {
  id: string
  severity: DomsCommissioningSeverity
  title: string
  detail: string
  evidence?: Record<string, unknown>
  nextAction?: string
}

export type DomsCommissioningStep = {
  id: string
  phase: string
  title: string
  owner: 'field-engineer' | 'support' | 'site-admin' | 'developer'
  required: boolean
  description: string
  evidenceRequired: string
  completed?: boolean
  notes?: string
  completedAt?: string | null
  completedByUserId?: string | null
  completedByUsername?: string | null
}

export type DomsCommissioningChecklistSummary = {
  total: number
  completed: number
  requiredTotal: number
  requiredCompleted: number
  percentComplete: number
  requiredPercentComplete: number
  updatedAt: string | null
}

export type DomsCommissioningReadiness = {
  status: DomsCommissioningStatus
  generatedAt: string
  settingsValidation: {
    status: DomsCommissioningStatus
    checks: DomsCommissioningCheck[]
    blockers: DomsCommissioningCheck[]
    warnings: DomsCommissioningCheck[]
  }
  commissioningChecklist: DomsCommissioningStep[]
  commissioningChecklistSummary: DomsCommissioningChecklistSummary
  legacyToJplRunbook: DomsCommissioningStep[]
  liveReadiness: {
    connected: boolean
    reconciliationSeverity: string
    fieldValidationStatus: string
    productionReleaseStatus: string
    blockingValidationItems: number
  }
}

const REQUIRED_UNSOLICITED_FLAGS = [
  'UNSO_INSTSTA_1',
  'UNSO_TRBUFSTA_3',
  'UNSO_TGSTA_1',
  'UNSO_DELIVSTA_1',
  'UNSO_PRISTA_1',
]

const REQUIRED_MFDR_FLAGS = ['UNSO_FPSTA_3']

const normalizeFlag = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()

const addCheck = (
  checks: DomsCommissioningCheck[],
  check: DomsCommissioningCheck,
) => {
  checks.push(check)
}

const statusFromChecks = (
  checks: DomsCommissioningCheck[],
): DomsCommissioningStatus => {
  if (checks.some((check) => check.severity === 'block')) return 'blocked'
  if (checks.some((check) => check.severity === 'warn')) {
    return 'ready-with-warnings'
  }
  return 'ready'
}

const isLocalhost = (host: string) => {
  const normalized = host.trim().toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '0.0.0.0'
  )
}

const parsePosId = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!/^\d{1,2}$/.test(text)) return null
  return Number.parseInt(text, 10)
}

const normalizeVersionNumbers = (value: unknown) => {
  return String(value ?? '')
    .trim()
    .match(/\d+/g)
    ?.map((part) => Number.parseInt(part, 10))
}

const compareVersions = (a: unknown, b: unknown) => {
  const left = normalizeVersionNumbers(a)
  const right = normalizeVersionNumbers(b)
  if (!left?.length || !right?.length) return null
  const width = Math.max(left.length, right.length)
  for (let i = 0; i < width; i += 1) {
    const av = left[i] ?? 0
    const bv = right[i] ?? 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

const hasRequiredFlag = (flags: string[], required: string) => {
  return flags.map(normalizeFlag).includes(required)
}

const requiredFlagChecks = (
  checks: DomsCommissioningCheck[],
  flags: string[],
  requiredFlags: string[],
  listName: string,
) => {
  const missing = requiredFlags.filter(
    (required) => !hasRequiredFlag(flags, required),
  )
  addCheck(checks, {
    id: `${listName}-flags`,
    severity: missing.length ? 'block' : 'pass',
    title: `${listName} subscription flags`,
    detail: missing.length
      ? `Missing required flags: ${missing.join(', ')}`
      : 'Required unsolicited subscription flags are configured.',
    evidence: { configured: flags, missing },
    nextAction: missing.length
      ? 'Add the missing flags before enabling live JPL bootstrap.'
      : undefined,
  })
}

export function validateDomsLiveConnectionSettings(
  settings: Pick<
    ForecourtRuntimeConfig,
    | 'jplHost'
    | 'jplPort'
    | 'jplPosId'
    | 'jplAccessCode'
    | 'jplCountryCode'
    | 'jplPosVersionId'
    | 'jplExpectedMinVersion'
    | 'jplHeartbeatIntervalMs'
    | 'jplDeadConnectionTimeoutMs'
    | 'jplUnsolicitedDrSeconds'
    | 'jplUnsolicitedFlags'
    | 'jplUnsolicitedMfdrFlags'
    | 'jplStatusUpdateCode'
    | 'jplBootstrapSnapshotEnabled'
    | 'bufferWarnDepthSup'
    | 'bufferCritDepthSup'
    | 'bufferWarnAgeMinSup'
    | 'bufferCritAgeMinSup'
    | 'bufferWarnDepthUnsup'
    | 'bufferCritDepthUnsup'
    | 'bufferWarnAgeMinUnsup'
    | 'bufferCritAgeMinUnsup'
    | 'jplTlsRequired'
  >,
) {
  const checks: DomsCommissioningCheck[] = []
  const host = String(settings.jplHost ?? '').trim()
  const port = Number(settings.jplPort)
  const posIdNumber = parsePosId(settings.jplPosId)
  const accessCodeFlags = String(settings.jplAccessCode ?? '')
    .split(',')
    .map(normalizeFlag)
    .filter(Boolean)

  addCheck(checks, {
    id: 'jpl-host',
    severity: host ? (isLocalhost(host) ? 'warn' : 'pass') : 'block',
    title: 'JPL host',
    detail: host
      ? isLocalhost(host)
        ? 'Host points to localhost. This is valid for simulator rehearsals but not for a field PSS unless the app runs on the controller host.'
        : 'JPL host is configured.'
      : 'JPL host is required before live connection can be enabled.',
    evidence: { host },
    nextAction: host
      ? isLocalhost(host)
        ? 'Replace with the PSS controller address before first site bring-up.'
        : undefined
      : 'Enter the PSS controller hostname or IP address.',
  })

  addCheck(checks, {
    id: 'jpl-port',
    severity:
      Number.isInteger(port) && port > 0 && port <= 65535
        ? port === 8888 || port === 8889
          ? 'pass'
          : 'warn'
        : 'block',
    title: 'JPL TCP port',
    detail:
      Number.isInteger(port) && port > 0 && port <= 65535
        ? port === 8888 || port === 8889
          ? 'JPL port matches the standard unencrypted or TLS port.'
          : 'JPL port is valid but not one of the standard DOMS/JPL ports.'
        : 'JPL port must be a valid TCP port.',
    evidence: { port, standardPorts: [8888, 8889] },
    nextAction:
      Number.isInteger(port) && port > 0 && port <= 65535
        ? undefined
        : 'Set 8888 for standard JPL or 8889 for TLS JPL.',
  })

  addCheck(checks, {
    id: 'jpl-tls-port',
    severity: settings.jplTlsRequired && port !== 8889 ? 'block' : 'pass',
    title: 'TLS JPL port alignment',
    detail:
      settings.jplTlsRequired && port !== 8889
        ? 'TLS is required but the configured port is not 8889.'
        : 'TLS requirement and port selection are aligned.',
    evidence: { jplTlsRequired: settings.jplTlsRequired === true, port },
    nextAction:
      settings.jplTlsRequired && port !== 8889
        ? 'Use port 8889 for TLS JPL deployments.'
        : undefined,
  })

  addCheck(checks, {
    id: 'jpl-pos-id',
    severity:
      posIdNumber == null || posIdNumber === 0 || posIdNumber >= 90
        ? 'block'
        : 'pass',
    title: 'JPL POS ID',
    detail:
      posIdNumber == null
        ? 'POS ID must be a one or two digit value.'
        : posIdNumber === 0
          ? 'POS ID 00 is reserved for lock release and must not be assigned to a client.'
          : posIdNumber >= 90
            ? 'POS IDs 90 and above are reserved/internal and must not be assigned to this app.'
            : 'POS ID is in the supported client range.',
    evidence: { posId: settings.jplPosId, numeric: posIdNumber },
    nextAction:
      posIdNumber == null || posIdNumber === 0 || posIdNumber >= 90
        ? 'Assign a unique POS ID from 01 to 89 for this physical client/session.'
        : undefined,
  })

  addCheck(checks, {
    id: 'jpl-access-code',
    severity:
      accessCodeFlags.includes('POS') && accessCodeFlags.includes('RI')
        ? 'pass'
        : 'block',
    title: 'FcAccessCode base flags',
    detail:
      accessCodeFlags.includes('POS') && accessCodeFlags.includes('RI')
        ? 'FcAccessCode includes POS and RI so rejects can carry diagnostic information.'
        : 'FcAccessCode must include POS and RI before production use.',
    evidence: { flags: accessCodeFlags },
    nextAction:
      accessCodeFlags.includes('POS') && accessCodeFlags.includes('RI')
        ? undefined
        : 'Save the access code through the setup screen so POS and RI are composed with the required subscription flags.',
  })

  requiredFlagChecks(
    checks,
    settings.jplUnsolicitedFlags ?? [],
    REQUIRED_UNSOLICITED_FLAGS,
    'general-unsolicited',
  )
  requiredFlagChecks(
    checks,
    settings.jplUnsolicitedMfdrFlags ?? [],
    REQUIRED_MFDR_FLAGS,
    'pump-mfdr',
  )

  const heartbeat = Number(settings.jplHeartbeatIntervalMs)
  const deadTimeout = Number(settings.jplDeadConnectionTimeoutMs)
  addCheck(checks, {
    id: 'jpl-heartbeat-window',
    severity:
      !Number.isFinite(heartbeat) || heartbeat <= 0
        ? 'block'
        : heartbeat > 15_000
          ? 'block'
          : 'pass',
    title: 'Heartbeat interval',
    detail:
      Number.isFinite(heartbeat) && heartbeat > 0 && heartbeat <= 15_000
        ? 'Heartbeat interval satisfies the JPL keepalive recommendation.'
        : 'Heartbeat interval must be positive and no greater than 15 seconds.',
    evidence: { heartbeatIntervalMs: heartbeat },
    nextAction:
      Number.isFinite(heartbeat) && heartbeat > 0 && heartbeat <= 15_000
        ? undefined
        : 'Use 15000 ms or lower for the client heartbeat interval.',
  })

  addCheck(checks, {
    id: 'jpl-dead-timeout-window',
    severity:
      !Number.isFinite(deadTimeout) || deadTimeout <= heartbeat
        ? 'block'
        : deadTimeout > 30_000
          ? 'warn'
          : 'pass',
    title: 'Dead connection timeout',
    detail:
      Number.isFinite(deadTimeout) && deadTimeout > heartbeat
        ? deadTimeout > 30_000
          ? 'Timeout is valid but above the JPL 30 second lost-connection guideline.'
          : 'Dead connection timeout follows the JPL lost-connection guideline.'
        : 'Dead connection timeout must be greater than the heartbeat interval.',
    evidence: {
      heartbeatIntervalMs: heartbeat,
      deadConnectionTimeoutMs: deadTimeout,
    },
    nextAction:
      Number.isFinite(deadTimeout) && deadTimeout > heartbeat
        ? deadTimeout > 30_000
          ? 'Consider using 30000 ms for production field acceptance.'
          : undefined
        : 'Set the dead connection timeout above the heartbeat interval.',
  })

  const minVersionCompare = compareVersions(
    settings.jplExpectedMinVersion,
    '470-02-1.07',
  )
  addCheck(checks, {
    id: 'jpl-min-version',
    severity:
      minVersionCompare == null || minVersionCompare < 0 ? 'block' : 'pass',
    title: 'Expected JPL version floor',
    detail:
      minVersionCompare == null
        ? 'Expected JPL minimum version could not be parsed.'
        : minVersionCompare < 0
          ? 'Expected JPL minimum version is below the correlation-ID capable version floor.'
          : 'Expected JPL version floor supports correlation IDs.',
    evidence: {
      expectedMinVersion: settings.jplExpectedMinVersion,
      requiredMinVersion: '470-02-1.07',
    },
    nextAction:
      minVersionCompare == null || minVersionCompare < 0
        ? 'Set the expected minimum version to 470-02-1.07 or newer.'
        : undefined,
  })

  const countryCode = String(settings.jplCountryCode ?? '').trim()
  addCheck(checks, {
    id: 'jpl-country-code',
    severity: /^\d{1,4}$/.test(countryCode) ? 'pass' : 'block',
    title: 'JPL country code',
    detail: /^\d{1,4}$/.test(countryCode)
      ? 'Country code is compatible with DEC4 formatting.'
      : 'Country code must be numeric and no more than four digits.',
    evidence: { countryCode },
    nextAction: /^\d{1,4}$/.test(countryCode)
      ? undefined
      : 'Set the DOMS/PSS country code confirmed for the site.',
  })

  addCheck(checks, {
    id: 'jpl-pos-version',
    severity: String(settings.jplPosVersionId ?? '').trim() ? 'pass' : 'block',
    title: 'POS version identifier',
    detail: String(settings.jplPosVersionId ?? '').trim()
      ? 'POS version identifier is configured.'
      : 'POS version identifier is required for FcLogon.',
    evidence: { posVersionId: settings.jplPosVersionId },
    nextAction: String(settings.jplPosVersionId ?? '').trim()
      ? undefined
      : 'Set the FTC/POS version identifier used in FcLogon.',
  })

  addCheck(checks, {
    id: 'jpl-status-update-mode',
    severity: Number(settings.jplStatusUpdateCode) === 3 ? 'pass' : 'warn',
    title: 'Status update mode',
    detail:
      Number(settings.jplStatusUpdateCode) === 3
        ? 'Status update code is configured for unsolicited updates and full update provocation.'
        : 'Status update code is not the expected first-release value of 3.',
    evidence: { statusUpdateCode: settings.jplStatusUpdateCode },
    nextAction:
      Number(settings.jplStatusUpdateCode) === 3
        ? undefined
        : 'Use status update code 3 unless field engineers approve a different mode.',
  })

  addCheck(checks, {
    id: 'jpl-bootstrap-snapshot',
    severity: settings.jplBootstrapSnapshotEnabled ? 'pass' : 'warn',
    title: 'Bootstrap reconciliation snapshot',
    detail: settings.jplBootstrapSnapshotEnabled
      ? 'Startup reconciliation snapshot is enabled.'
      : 'Startup reconciliation snapshot is disabled; field acceptance will need manual snapshot evidence.',
    evidence: { enabled: settings.jplBootstrapSnapshotEnabled },
    nextAction: settings.jplBootstrapSnapshotEnabled
      ? undefined
      : 'Enable bootstrap snapshot before first live site validation unless intentionally disabled.',
  })

  const thresholdPairs = [
    [
      'supervised depth',
      settings.bufferWarnDepthSup,
      settings.bufferCritDepthSup,
    ],
    [
      'supervised age',
      settings.bufferWarnAgeMinSup,
      settings.bufferCritAgeMinSup,
    ],
    [
      'unsupervised depth',
      settings.bufferWarnDepthUnsup,
      settings.bufferCritDepthUnsup,
    ],
    [
      'unsupervised age',
      settings.bufferWarnAgeMinUnsup,
      settings.bufferCritAgeMinUnsup,
    ],
  ] as const

  for (const [label, warn, crit] of thresholdPairs) {
    const warnNo = Number(warn)
    const critNo = Number(crit)
    const valid =
      Number.isFinite(warnNo) &&
      Number.isFinite(critNo) &&
      warnNo >= 0 &&
      critNo >= warnNo
    addCheck(checks, {
      id: `buffer-threshold-${label.replaceAll(' ', '-')}`,
      severity: valid ? 'pass' : 'block',
      title: `Buffer threshold: ${label}`,
      detail: valid
        ? 'Buffer warning and critical thresholds are ordered correctly.'
        : 'Buffer critical threshold must be greater than or equal to the warning threshold.',
      evidence: { warn: warnNo, critical: critNo },
      nextAction: valid
        ? undefined
        : 'Fix buffer thresholds before relying on backlog/stale-lock diagnostics.',
    })
  }

  const blockers = checks.filter((check) => check.severity === 'block')
  const warnings = checks.filter((check) => check.severity === 'warn')

  return {
    status: statusFromChecks(checks),
    checks,
    blockers,
    warnings,
  }
}

export function buildDomsFirstSiteCommissioningChecklist(): DomsCommissioningStep[] {
  return [
    {
      id: 'commissioning-field-scope',
      phase: 'pre-site',
      title: 'Site scope and acceptance criteria confirmed',
      owner: 'field-engineer',
      required: true,
      description:
        'Confirm the controller address, POS ID, TLS mode, pump count, nozzle count, tank count, price control, fiscal route, and agreed acceptance sequence before live work starts.',
      evidenceRequired:
        'Deployment ticket or site scope containing the expected physical and logical forecourt inventory.',
    },
    {
      id: 'commissioning-registration',
      phase: 'pre-site',
      title: 'FTC station and device registration verified',
      owner: 'site-admin',
      required: true,
      description:
        'Confirm the FTC is registered to the correct cloud site and that Site ID, Site name, and Device ID match the deployment record.',
      evidenceRequired:
        'Registration page screenshot or deployment record containing the matching identifiers.',
    },
    {
      id: 'commissioning-pss-configurator',
      phase: 'configuration',
      title: 'PSS Configurator logical installation verified',
      owner: 'field-engineer',
      required: true,
      description:
        'Confirm the PSS Configurator remains the source of truth for installed pumps, fuelling points, grade options, tanks, gauges, and price equipment.',
      evidenceRequired:
        'Current PSS Configurator export or screenshots matching the physical site.',
    },
    {
      id: 'commissioning-live-settings',
      phase: 'configuration',
      title: 'JPL connection and buffer settings validated',
      owner: 'site-admin',
      required: true,
      description:
        'Clear all setting blockers for host, port, POS ID, access code, heartbeat, dead-connection timeout, version floor, subscriptions, TLS, and buffer thresholds.',
      evidenceRequired:
        'Commissioning readiness result showing no setting blockers.',
    },
    {
      id: 'commissioning-connectivity-test',
      phase: 'configuration',
      title: 'Controller connection, logon, and status snapshot verified',
      owner: 'support',
      required: true,
      description:
        'Connect to the target PSS, complete FcLogon, enable status updates, and confirm at least one live controller status response.',
      evidenceRequired:
        'Saved connectivity result with connected and logged-on state plus the observed JPL version.',
    },
    {
      id: 'commissioning-products-grades',
      phase: 'configuration',
      title: 'Products, grades, and prices verified',
      owner: 'field-engineer',
      required: true,
      description:
        'Compare FTC products and grade prices to the controller and site price schedule. Resolve stale or missing products before a test dispense.',
      evidenceRequired:
        'Product/grade comparison and current price set reference.',
    },
    {
      id: 'commissioning-pump-mappings',
      phase: 'mapping',
      title: 'Pump and fuelling-point mappings verified',
      owner: 'field-engineer',
      required: true,
      description:
        'Confirm every FTC pump maps to the correct DOMS FpId and that the physical pump label agrees with the PSS configuration.',
      evidenceRequired:
        'Reconciliation result or approved bulk mapping dry-run with no pump blockers.',
    },
    {
      id: 'commissioning-nozzle-mappings',
      phase: 'mapping',
      title: 'Nozzle, grade-option, grade, and tank mappings verified',
      owner: 'field-engineer',
      required: true,
      description:
        'Verify each nozzle against the physical hose, DOMS grade option, forecourt grade, and supplying tank.',
      evidenceRequired:
        'Nozzle mapping sheet or reconciliation result with physical verification notes.',
    },
    {
      id: 'commissioning-tank-gauges',
      phase: 'field-validation',
      title: 'Tank gauges respond and tank assignments are correct',
      owner: 'field-engineer',
      required: true,
      description:
        'Refresh tank gauge data, confirm every configured TgId responds, and verify tank/product assignments. Zero readings are acceptable only when confirmed as the controller state.',
      evidenceRequired:
        'Tank gauge response summary and technician note for any zero or unavailable reading.',
    },
    {
      id: 'commissioning-price-equipment',
      phase: 'field-validation',
      title: 'Price profiles and price display equipment verified',
      owner: 'field-engineer',
      required: true,
      description:
        'Confirm the active price set, price groups, grade assignments, and any configured price-board mappings match the site.',
      evidenceRequired:
        'Active price-set reference and price-board verification result.',
    },
    {
      id: 'commissioning-test-dispense',
      phase: 'field-validation',
      title: 'Supervised test dispense captured end to end',
      owner: 'field-engineer',
      required: true,
      description:
        'Authorize and complete an approved test dispense, then verify the transaction is durably captured, linked to the correct pump/nozzle, and cleared according to policy.',
      evidenceRequired:
        'Transaction ID, FpId, sequence number, amount, volume, and replay/checkpoint result.',
    },
    {
      id: 'commissioning-receipt-printer',
      phase: 'field-validation',
      title: 'Receipt preview and physical print verified',
      owner: 'site-admin',
      required: true,
      description:
        'Confirm the receipt template, station branding, printer routing, and physical output are correct for the station country.',
      evidenceRequired:
        'Receipt preview reference and signed physical print sample.',
    },
    {
      id: 'commissioning-fiscal-route',
      phase: 'fiscalization',
      title: 'Country fiscal route and registration verified',
      owner: 'site-admin',
      required: true,
      description:
        'Confirm the station uses the correct country fiscal route and that the required fiscal device registration, endpoint configuration, and signing material are valid.',
      evidenceRequired:
        'Fiscal route readiness result and current registration response reference.',
    },
    {
      id: 'commissioning-ewura',
      phase: 'fiscalization',
      title: 'EWURA registration verified for Tanzania sites',
      owner: 'site-admin',
      required: false,
      description:
        'For Tanzania deployments, confirm the EWURA registration request and latest response are stored and accepted. Mark not applicable in notes for other countries.',
      evidenceRequired:
        'EWURA registration response or an explicit not-applicable note.',
    },
    {
      id: 'commissioning-first-sale',
      phase: 'acceptance',
      title: 'First production-equivalent sale and receipt verified',
      owner: 'field-engineer',
      required: true,
      description:
        'Complete the agreed acceptance sale and verify transaction capture, fiscalization where applicable, receipt content, and cloud synchronization.',
      evidenceRequired:
        'Transaction, fiscal receipt, synchronization result, and operator sign-off references.',
    },
    {
      id: 'commissioning-shift-close',
      phase: 'acceptance',
      title: 'Shift close or Z-report workflow verified',
      owner: 'site-admin',
      required: true,
      description:
        'Run the country-appropriate shift close or Z-report workflow and confirm counters, totals, fiscal response, and printed output.',
      evidenceRequired: 'Z-report or shift-close reference and signed output.',
    },
    {
      id: 'commissioning-support-bundle',
      phase: 'sign-off',
      title: 'Support bundle and final readiness evidence exported',
      owner: 'support',
      required: true,
      description:
        'Capture the redacted support bundle, workflow review, field validation readiness, and outstanding action list before the final go/no-go decision.',
      evidenceRequired:
        'Support bundle and readiness exports attached to the deployment ticket.',
    },
  ]
}

export function buildDomsLegacyToJplRunbook(): DomsCommissioningStep[] {
  return [
    {
      id: 'legacy-freeze-current-mode',
      phase: 'pre-cutover',
      title: 'Freeze legacy/simulator state before cutover',
      owner: 'site-admin',
      required: true,
      description:
        'Stop creating new forecourt transactions in legacy or simulator mode before moving the site to JPL-only operation.',
      evidenceRequired:
        'Timestamped operator note confirming the last legacy/simulator transaction window.',
    },
    {
      id: 'legacy-drain-local-queues',
      phase: 'pre-cutover',
      title: 'Drain or reconcile pending local queues',
      owner: 'support',
      required: true,
      description:
        'Ensure transaction, report, fiscalization, EWURA, and proxy queues are empty or intentionally held with documented owner action.',
      evidenceRequired:
        'Queue health screenshot or support bundle showing no open blocking work.',
    },
    {
      id: 'legacy-save-jpl-settings',
      phase: 'cutover',
      title: 'Save JPL-only forecourt settings',
      owner: 'site-admin',
      required: true,
      description:
        'Save station-scoped JPL settings through the setup UI. Environment-only settings must not be the production source of truth.',
      evidenceRequired:
        'Admin setup response or commissioning readiness export showing jpl_tcp runtime settings.',
    },
    {
      id: 'legacy-test-jpl-logon',
      phase: 'cutover',
      title: 'Run JPL logon and status test',
      owner: 'support',
      required: true,
      description:
        'Run the JPL settings test before enabling the site for operators. Do not continue if FcLogon or status checks fail.',
      evidenceRequired:
        'Connectivity test result with accepted access-code candidate and no unexplained reject response.',
    },
    {
      id: 'legacy-restart-runtime',
      phase: 'cutover',
      title: 'Restart FTC runtime services',
      owner: 'support',
      required: true,
      description:
        'Restart the web/runtime process so station KV JPL settings are loaded by long-lived adapters and workers.',
      evidenceRequired:
        'Runtime restart timestamp and first post-restart health event.',
    },
    {
      id: 'legacy-monitor-first-hour',
      phase: 'post-cutover',
      title: 'Monitor the first operating hour',
      owner: 'support',
      required: true,
      description:
        'Watch heartbeats, reconnects, rejects, buffer backlog, stale locks, and transaction clears after cutover.',
      evidenceRequired:
        'Support bundle after one hour with counters reviewed and no blocking conditions.',
    },
  ]
}
