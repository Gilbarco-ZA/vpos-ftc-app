import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getDomsFieldValidationReadiness } from './getDomsFieldValidationReadiness'
import { getDomsRuntimeDomainSnapshot } from './getDomsRuntimeDomainSnapshot'

export type DomsOperationalSeverity = 'info' | 'warning' | 'critical'
export type DomsOperationalStatus = 'ready' | 'degraded' | 'blocked'

export type DomsOperationalActionItem = {
  id: string
  domain: string
  severity: DomsOperationalSeverity
  title: string
  description: string
  nextAction: string
  blocksOperation: boolean
  evidence: Record<string, unknown>
}

export type DomsOperationalSection = {
  id: string
  title: string
  status: DomsOperationalStatus
  summary: string
  metrics: Record<string, unknown>
  actionItems: DomsOperationalActionItem[]
}

export type BuildDomsOperationalReadinessInput = {
  stationId?: string
  generatedAt?: string
  domainSnapshot: any
  fieldValidation?: any
}

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}

const bitFlag = (value: unknown, ...keys: string[]) => {
  const object = asObject(value)
  const bits = asObject(object.bits)
  return keys.some((key) => Boolean(bits[key] ?? object[key]))
}

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const statusFromItems = (
  items: DomsOperationalActionItem[],
): DomsOperationalStatus => {
  if (items.some((item) => item.severity === 'critical')) return 'blocked'
  if (items.some((item) => item.severity === 'warning')) return 'degraded'
  return 'ready'
}

const addItem = (
  items: DomsOperationalActionItem[],
  item: DomsOperationalActionItem,
) => {
  items.push(item)
}

const countItems = (items: DomsOperationalActionItem[]) =>
  items.reduce(
    (acc, item) => {
      acc.total += 1
      acc[item.severity] += 1
      if (item.blocksOperation) acc.blocking += 1
      return acc
    },
    { total: 0, info: 0, warning: 0, critical: 0, blocking: 0 },
  )

const countByStatus = (sections: DomsOperationalSection[]) =>
  sections.reduce(
    (acc, section) => {
      acc[section.status] += 1
      return acc
    },
    { ready: 0, degraded: 0, blocked: 0 },
  )

const createSection = (
  id: string,
  title: string,
  summary: string,
  metrics: Record<string, unknown>,
  actionItems: DomsOperationalActionItem[],
): DomsOperationalSection => ({
  id,
  title,
  status: statusFromItems(actionItems),
  summary,
  metrics,
  actionItems,
})

const buildConnectionSection = (snapshot: any): DomsOperationalSection => {
  const connection = asObject(snapshot?.connection)
  const items: DomsOperationalActionItem[] = []

  if (!connection.connected) {
    addItem(items, {
      id: 'jpl-connection-offline',
      domain: 'connection',
      severity: 'critical',
      title: 'DOMS/JPL connection is offline',
      description:
        'The runtime has no active JPL socket connection, so pump/tank workflow state cannot be trusted for live operations.',
      nextAction:
        'Verify network route, DOMS host/port/TLS settings, and PSS availability before accepting live forecourt operation.',
      blocksOperation: true,
      evidence: {
        connected: connection.connected ?? false,
        secureMode: connection.secureMode ?? null,
        reconnectAttempts: connection.reconnectAttempts ?? 0,
        lastError: connection.lastError ?? null,
      },
    })
  }

  if (connection.connected && !connection.loggedOn) {
    addItem(items, {
      id: 'jpl-logon-not-complete',
      domain: 'connection',
      severity: 'critical',
      title: 'JPL socket is connected but FcLogon has not completed',
      description:
        'The socket may be open, but the PSS application session has not been bootstrapped for operational requests and unsolicited updates.',
      nextAction:
        'Review FcAccessCode, CountryCode, PosVersionId, and the latest RejectMessage diagnostics.',
      blocksOperation: true,
      evidence: {
        loggedOn: connection.loggedOn ?? false,
        posId: connection.posId ?? null,
        welcomeVersion: connection.welcomeVersion ?? null,
        lastReject: connection.lastReject ?? null,
      },
    })
  }

  if (connection.stale) {
    addItem(items, {
      id: 'jpl-inbound-traffic-stale',
      domain: 'connection',
      severity: 'critical',
      title: 'Inbound JPL traffic is stale',
      description:
        'No recent message or heartbeat has been observed within the configured dead-connection timeout.',
      nextAction:
        'Allow reconnect to complete, then confirm heartbeat/logon/bootstrap traffic before authorizing operations.',
      blocksOperation: true,
      evidence: {
        lastMessageAgeMs: connection.lastMessageAgeMs ?? null,
        deadConnectionTimeoutMs: connection.deadConnectionTimeoutMs ?? null,
      },
    })
  }

  if (connection.lastReject) {
    addItem(items, {
      id: 'jpl-reject-present',
      domain: 'connection',
      severity: 'warning',
      title: 'Recent JPL reject requires review',
      description:
        'The PSS/JTM has rejected at least one recent request. Repeated rejects can indicate schema, access, state, or command sequencing issues.',
      nextAction:
        'Open DOMS diagnostics, inspect RejectInfoText and correlation ID, then fix the command path or operator workflow.',
      blocksOperation: false,
      evidence: connection.lastReject,
    })
  }

  if (connection.lastFrameDiagnostic?.valid === false) {
    addItem(items, {
      id: 'jpl-framing-fault-present',
      domain: 'connection',
      severity: 'warning',
      title: 'Recent JPL frame diagnostic is invalid',
      description:
        'A malformed STX/ETX frame or invalid payload was observed. This can make downstream status snapshots incomplete.',
      nextAction:
        'Review the frame diagnostic preview and confirm whether the fault is caused by network noise, simulator output, or application framing.',
      blocksOperation: false,
      evidence: connection.lastFrameDiagnostic,
    })
  }

  return createSection(
    'connection',
    'Connection and session',
    items.length
      ? 'The DOMS/JPL session has connection conditions requiring review.'
      : 'The DOMS/JPL session is online and recently active.',
    {
      connected: Boolean(connection.connected),
      loggedOn: Boolean(connection.loggedOn),
      stale: Boolean(connection.stale),
      lastMessageAgeMs: connection.lastMessageAgeMs ?? null,
      reconnectAttempts: connection.reconnectAttempts ?? 0,
      secureMode: Boolean(connection.secureMode),
    },
    items,
  )
}

const buildForecourtSection = (snapshot: any): DomsOperationalSection => {
  const fcStatus = asObject(snapshot?.forecourt?.fcStatus)
  const status1 = asObject(fcStatus.FcStatus1Flags)
  const status2 = asObject(fcStatus.FcStatus2Flags)
  const items: DomsOperationalActionItem[] = []

  if (bitFlag(status2, 'HwSwIncompatibilityWithinFc')) {
    addItem(items, {
      id: 'fc-hardware-software-incompatibility',
      domain: 'forecourt',
      severity: 'critical',
      title: 'PSS hardware/software incompatibility reported',
      description:
        'The Forecourt Controller status flags indicate a hardware/software incompatibility condition.',
      nextAction:
        'Stop live acceptance, export the support bundle, and escalate to field engineering/DOMS support before clearing the release gate.',
      blocksOperation: true,
      evidence: { FcStatus2Flags: status2 },
    })
  }

  if (bitFlag(status2, 'RtcError')) {
    addItem(items, {
      id: 'fc-rtc-error',
      domain: 'forecourt',
      severity: 'critical',
      title: 'Forecourt Controller RTC error reported',
      description:
        'The PSS real-time clock is used for transactions and receipts. RTC faults can invalidate operational timestamps.',
      nextAction:
        'Verify PSS date/time, correct the RTC through the controlled commissioning workflow, and record validation evidence.',
      blocksOperation: true,
      evidence: { FcStatus2Flags: status2 },
    })
  }

  if (bitFlag(status1, 'FallbackMode')) {
    addItem(items, {
      id: 'fc-fallback-mode-active',
      domain: 'forecourt',
      severity: 'warning',
      title: 'Forecourt Controller fallback mode is active',
      description:
        'Fallback mode changes how the site behaves and must be reviewed before normal production workflow assumptions are used.',
      nextAction:
        'Review fallback totals/status, confirm field process expectations, and clear fallback conditions before release sign-off.',
      blocksOperation: false,
      evidence: { FcStatus1Flags: status1 },
    })
  }

  if (bitFlag(status1, 'OpWithStoredTransDisabled')) {
    addItem(items, {
      id: 'fc-stored-transactions-disabled',
      domain: 'forecourt',
      severity: 'critical',
      title: 'Operation with stored transactions is disabled',
      description:
        'The controller reports that operation with stored transactions is disabled. Transaction-buffer recovery assumptions must be reviewed.',
      nextAction:
        'Resolve stored-transaction restriction with field engineering before accepting pump transaction workflows.',
      blocksOperation: true,
      evidence: { FcStatus1Flags: status1 },
    })
  }

  if (bitFlag(status2, 'ServiceMsgReady')) {
    addItem(items, {
      id: 'fc-service-log-ready',
      domain: 'forecourt',
      severity: 'warning',
      title: 'PSS service-log messages are pending',
      description:
        'The PSS service-log buffer has data available. Messages should be collected and routed before accepting a clean site state.',
      nextAction:
        'Allow the automatic service-message drain to complete, then review classified service messages in workflow review.',
      blocksOperation: false,
      evidence: { FcStatus2Flags: status2 },
    })
  }

  if (bitFlag(status2, 'BackOfficeRecordExists')) {
    addItem(items, {
      id: 'fc-back-office-record-ready',
      domain: 'forecourt',
      severity: 'warning',
      title: 'Back-office records are pending in the PSS buffer',
      description:
        'Back Office Records should be collected, persisted, and cleared from the controller buffer before release sign-off.',
      nextAction:
        'Allow BOR collection to complete, then review pending replay candidates and buffer-clear status.',
      blocksOperation: false,
      evidence: { FcStatus2Flags: status2 },
    })
  }

  return createSection(
    'forecourt',
    'Forecourt controller',
    items.length
      ? 'The Forecourt Controller has status flags requiring operational review.'
      : 'No blocking Forecourt Controller status flags are currently present.',
    {
      fallbackMode: bitFlag(status1, 'FallbackMode'),
      rtcError: bitFlag(status2, 'RtcError'),
      hardwareSoftwareIncompatibility: bitFlag(
        status2,
        'HwSwIncompatibilityWithinFc',
      ),
      serviceMessageReady: bitFlag(status2, 'ServiceMsgReady'),
      backOfficeRecordExists: bitFlag(status2, 'BackOfficeRecordExists'),
    },
    items,
  )
}

const buildDispenseSection = (snapshot: any): DomsOperationalSection => {
  const dispense = asObject(snapshot?.dispense)
  const severityCounts = asObject(dispense.severityCounts)
  const items: DomsOperationalActionItem[] = []
  const pumpCount = numberValue(dispense?.summary?.uniqueCount)
  const errorCount = numberValue(severityCounts.error)
  const warningCount = numberValue(severityCounts.warning)
  const recentErrorCount = asArray(dispense.recentErrors).length

  if (pumpCount === 0) {
    addItem(items, {
      id: 'dispense-no-pump-status',
      domain: 'dispense',
      severity: 'warning',
      title: 'No pump status snapshots observed',
      description:
        'No normalized FpStatus snapshots are available in runtime state. UI and recovery workflows may be operating without live pump state.',
      nextAction:
        'Verify FcLogon unsolicited access tags and request FpStatus with FpId=00 during commissioning.',
      blocksOperation: false,
      evidence: { pumpCount },
    })
  }

  if (errorCount > 0 || recentErrorCount > 0) {
    addItem(items, {
      id: 'dispense-pump-error-present',
      domain: 'dispense',
      severity: 'critical',
      title: 'Pump error or emergency state detected',
      description:
        'One or more pump snapshots or recent error messages indicate error/estop state.',
      nextAction:
        'Review pump-specific errors, confirm safe recovery with the site operator, then use authorized reset/clear-error workflows only when permitted.',
      blocksOperation: true,
      evidence: {
        errorCount,
        recentErrorCount,
        pumps: asArray(dispense.pumps).slice(0, 20),
      },
    })
  }

  if (warningCount > 0) {
    addItem(items, {
      id: 'dispense-pump-warning-present',
      domain: 'dispense',
      severity: 'warning',
      title: 'Pump warning or offline condition detected',
      description:
        'One or more pump snapshots are not in a normal operational state.',
      nextAction:
        'Review the affected FpIds and confirm whether the state is expected for commissioning or live operations.',
      blocksOperation: false,
      evidence: { warningCount, pumps: asArray(dispense.pumps).slice(0, 20) },
    })
  }

  return createSection(
    'dispense',
    'Dispense control',
    items.length
      ? 'Pump runtime state has issues requiring review.'
      : 'Pump runtime state has no current blocking indicators.',
    {
      pumpCount,
      errorCount,
      warningCount,
      recentErrorCount,
    },
    items,
  )
}

const buildWetstockSection = (snapshot: any): DomsOperationalSection => {
  const wetstock = asObject(snapshot?.wetstock)
  const severityCounts = asObject(wetstock.severityCounts)
  const deliveryStatus = asObject(wetstock.siteDeliveryStatus?.normalized)
  const items: DomsOperationalActionItem[] = []
  const tankCount = numberValue(wetstock?.summary?.uniqueCount)
  const errorCount = numberValue(severityCounts.error)
  const warningCount = numberValue(severityCounts.warning)
  const recentDeliveryReports = asArray(wetstock.recentTankDeliveryData).length

  if (tankCount === 0) {
    addItem(items, {
      id: 'wetstock-no-tank-status',
      domain: 'wetstock',
      severity: 'warning',
      title: 'No tank status snapshots observed',
      description:
        'No normalized TgStatus snapshots are available. Wetstock reconciliation and delivery lifecycle review may be incomplete.',
      nextAction:
        'Verify tank gauge installation, unsolicited TgStatus access tags, and request TgStatus/TgData during commissioning.',
      blocksOperation: false,
      evidence: { tankCount },
    })
  }

  if (errorCount > 0) {
    addItem(items, {
      id: 'wetstock-tank-error-present',
      domain: 'wetstock',
      severity: 'critical',
      title: 'Tank gauge error condition detected',
      description:
        'One or more tank gauge snapshots indicate an active error condition.',
      nextAction:
        'Review active tank alarms/errors and follow the wetstock recovery runbook before accepting inventory data.',
      blocksOperation: true,
      evidence: { errorCount, tanks: asArray(wetstock.tanks).slice(0, 20) },
    })
  }

  if (warningCount > 0) {
    addItem(items, {
      id: 'wetstock-tank-warning-present',
      domain: 'wetstock',
      severity: 'warning',
      title: 'Tank gauge warning or alarm condition detected',
      description:
        'One or more tank gauge snapshots indicate active alarms or warning state.',
      nextAction:
        'Review tank-specific alarm labels/severity and record field outcome before release sign-off.',
      blocksOperation: false,
      evidence: { warningCount, tanks: asArray(wetstock.tanks).slice(0, 20) },
    })
  }

  if (asArray(deliveryStatus.clearCandidates).length > 0) {
    addItem(items, {
      id: 'wetstock-delivery-clear-candidates',
      domain: 'wetstock',
      severity: 'warning',
      title: 'Tank delivery clear candidates are available',
      description:
        'Delivery monitoring has detected clear candidates. These need operator review before data is cleared from DOMS/PSS.',
      nextAction:
        'Review TankDeliveryData snapshots and confirm whether clear_TankDeliveryData should be sent by an authorized workflow.',
      blocksOperation: false,
      evidence: { clearCandidates: deliveryStatus.clearCandidates },
    })
  }

  return createSection(
    'wetstock',
    'Wetstock and delivery',
    items.length
      ? 'Wetstock runtime state has issues requiring review.'
      : 'Wetstock runtime state has no current blocking indicators.',
    {
      tankCount,
      errorCount,
      warningCount,
      recentDeliveryReports,
      clearCandidateCount: asArray(deliveryStatus.clearCandidates).length,
    },
    items,
  )
}

const buildOptionalModuleSection = (snapshot: any): DomsOperationalSection => {
  const optional = asObject(snapshot?.optionalModules)
  const items: DomsOperationalActionItem[] = []
  const families = [
    ['price-poles', optional.pricePoles],
    ['wash', optional.wash],
    ['digital-io', optional.digitalIo],
    ['sensors', optional.sensors],
    ['vending', optional.vending],
  ] as Array<[string, any]>

  let warningCount = 0
  let errorCount = 0
  let deviceCount = 0

  for (const [family, data] of families) {
    const familyData = asObject(data)
    const counts = asObject(familyData.severityCounts)
    const familyWarnings = numberValue(counts.warning)
    const familyErrors = numberValue(counts.error)
    const familyDevices = numberValue(familyData?.summary?.uniqueCount)
    warningCount += familyWarnings
    errorCount += familyErrors
    deviceCount += familyDevices

    if (familyErrors > 0) {
      addItem(items, {
        id: `optional-${family}-error`,
        domain: 'optional-modules',
        severity: 'critical',
        title: `${family} error condition detected`,
        description:
          'An optional DOMS module has a runtime error condition that may affect site operations if that module is in use.',
        nextAction:
          'Confirm whether this optional module is part of the site scope, then review the device-specific status/error payload.',
        blocksOperation: false,
        evidence: familyData,
      })
    } else if (familyWarnings > 0) {
      addItem(items, {
        id: `optional-${family}-warning`,
        domain: 'optional-modules',
        severity: 'warning',
        title: `${family} warning condition detected`,
        description:
          'An optional DOMS module has warning/offline state. This may be acceptable when the device family is not commissioned for the site.',
        nextAction:
          'Confirm site scope and close out the warning before marking optional module validation complete.',
        blocksOperation: false,
        evidence: familyData,
      })
    }
  }

  return createSection(
    'optional-modules',
    'Optional modules',
    items.length
      ? 'Optional module runtime state contains warnings or errors.'
      : 'Optional modules have no current warning/error indicators.',
    { deviceCount, warningCount, errorCount },
    items,
  )
}

const buildSpecialRecordsSection = (snapshot: any): DomsOperationalSection => {
  const special = asObject(snapshot?.specialRecords)
  const serviceMessages = asArray(special.serviceMessages)
  const backOfficeRecords = asArray(special.backOfficeRecords)
  const items: DomsOperationalActionItem[] = []

  if (serviceMessages.length > 0) {
    addItem(items, {
      id: 'special-service-messages-recent',
      domain: 'special-records',
      severity: 'warning',
      title: 'Recent DOMS service-log messages are present',
      description:
        'Service-log messages should be reviewed and routed because older messages can be lost when the PSS buffer fills.',
      nextAction:
        'Review classified service-log rows in workflow review and escalate unknown/critical routes.',
      blocksOperation: false,
      evidence: { serviceMessages: serviceMessages.slice(0, 10) },
    })
  }

  if (backOfficeRecords.length > 0) {
    addItem(items, {
      id: 'special-bor-recent',
      domain: 'special-records',
      severity: 'warning',
      title: 'Recent Back Office Records are present',
      description:
        'Back Office Records may require replay or downstream processing after DOMS buffer collection.',
      nextAction:
        'Review BOR processing status and retry/close replay candidates before release sign-off.',
      blocksOperation: false,
      evidence: { backOfficeRecords: backOfficeRecords.slice(0, 10) },
    })
  }

  return createSection(
    'special-records',
    'Service-log and BOR processing',
    items.length
      ? 'Special-record buffers have recent data that should be reviewed.'
      : 'No recent service-log or Back Office Record items are currently surfaced.',
    {
      serviceMessageCount: serviceMessages.length,
      backOfficeRecordCount: backOfficeRecords.length,
    },
    items,
  )
}

const buildReleaseGateSection = (
  fieldValidation: any,
): DomsOperationalSection => {
  const releaseGate = asObject(fieldValidation?.releaseGate)
  const blockingItems = asArray(fieldValidation?.blockingItems)
  const items: DomsOperationalActionItem[] = []
  const status = String(releaseGate.status ?? '').toLowerCase()

  if (status && status !== 'passed') {
    addItem(items, {
      id: 'release-gate-not-passed',
      domain: 'release-gate',
      severity: 'critical',
      title: 'Field-validation release gate is not passed',
      description:
        'Production release remains blocked until latest evidence checkpoints pass for all production-blocking validation items.',
      nextAction:
        'Import build/test, simulator, live-controller, Tanzania endpoint, and cloud-cutover evidence as applicable, then re-check the release gate.',
      blocksOperation: true,
      evidence: {
        status: releaseGate.status ?? null,
        blockingCount: blockingItems.length,
        latestEvidenceAt: releaseGate.latestEvidenceAt ?? null,
      },
    })
  }

  return createSection(
    'release-gate',
    'Field-validation release gate',
    items.length
      ? 'Field validation still blocks production release.'
      : 'Field-validation release gate has no current blocking signal.',
    {
      status: releaseGate.status ?? null,
      passed: releaseGate.passed ?? false,
      blockingCount: blockingItems.length,
      latestEvidenceAt: releaseGate.latestEvidenceAt ?? null,
    },
    items,
  )
}

export function buildDomsOperationalReadiness(
  input: BuildDomsOperationalReadinessInput,
) {
  const stationId = String(
    input.stationId ?? input.domainSnapshot?.stationId ?? '',
  )
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const sections = [
    buildConnectionSection(input.domainSnapshot),
    buildForecourtSection(input.domainSnapshot),
    buildDispenseSection(input.domainSnapshot),
    buildWetstockSection(input.domainSnapshot),
    buildOptionalModuleSection(input.domainSnapshot),
    buildSpecialRecordsSection(input.domainSnapshot),
    buildReleaseGateSection(input.fieldValidation),
  ]
  const actionItems = sections.flatMap((section) => section.actionItems)
  const actionCounts = countItems(actionItems)
  const sectionCounts = countByStatus(sections)
  const overallStatus: DomsOperationalStatus = sections.some(
    (section) => section.status === 'blocked',
  )
    ? 'blocked'
    : sections.some((section) => section.status === 'degraded')
      ? 'degraded'
      : 'ready'

  return {
    success: true,
    stationId,
    generatedAt,
    mode: 'doms-operational-readiness',
    overallStatus,
    summary: {
      actionCounts,
      sectionCounts,
      blockingActionCount: actionCounts.blocking,
      criticalActionCount: actionCounts.critical,
      warningActionCount: actionCounts.warning,
      readySectionCount: sectionCounts.ready,
      degradedSectionCount: sectionCounts.degraded,
      blockedSectionCount: sectionCounts.blocked,
    },
    operatorDecision: {
      canProceedWithLiveOperations: overallStatus === 'ready',
      canProceedWithCommissioning:
        overallStatus !== 'blocked' || actionCounts.blocking === 0,
      requiresFieldEngineer:
        actionItems.some((item) => item.severity === 'critical') ||
        String(input.fieldValidation?.releaseGate?.status ?? '') !== 'passed',
      nextBestAction:
        actionItems.find((item) => item.severity === 'critical')?.nextAction ??
        actionItems.find((item) => item.severity === 'warning')?.nextAction ??
        'Continue monitoring DOMS/JPL runtime state and keep validation evidence current.',
    },
    sections,
    actionItems,
    releaseGate: input.fieldValidation?.releaseGate ?? null,
    sourceSnapshots: {
      domainGeneratedAt: input.domainSnapshot?.generatedAt ?? null,
      fieldValidationGeneratedAt: input.fieldValidation?.generatedAt ?? null,
    },
  }
}

export async function getDomsOperationalReadiness(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const [domainSnapshot, fieldValidation] = await Promise.all([
    getDomsRuntimeDomainSnapshot(normalizedStationId),
    getDomsFieldValidationReadiness(normalizedStationId),
  ])

  return buildDomsOperationalReadiness({
    stationId: normalizedStationId,
    domainSnapshot,
    fieldValidation,
  })
}
