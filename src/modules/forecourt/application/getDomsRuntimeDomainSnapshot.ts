import { getJplAdapterState } from '@/src/shared/forecourt/jplState'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { supportedJplResponseNames } from '@/src/modules/forecourt/infrastructure/jpl/protocol/responses'

const nowMs = () => Date.now()

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const ageMs = (timestamp: unknown) => {
  const parsed = Number(timestamp)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.max(0, nowMs() - parsed)
}

const severityFromStatus = (status: unknown) => {
  const text = String(status ?? '').toLowerCase()
  if (text.includes('error') || text.includes('estop')) return 'error'
  if (text.includes('alarm') || text.includes('warning')) return 'warning'
  if (text.includes('offline') || text.includes('closed')) return 'warning'
  return 'ok'
}

const summarizeList = (rows: any[], idKey: string) => {
  const uniqueIds = new Set(
    rows.map((row) => String(row?.[idKey] ?? '').trim()).filter(Boolean),
  )
  return {
    count: rows.length,
    uniqueCount: uniqueIds.size,
    ids: [...uniqueIds].sort((a, b) => a.localeCompare(b)),
    latestAt: rows.reduce<number | null>((latest, row) => {
      const at = Number(row?.at)
      if (!Number.isFinite(at)) return latest
      return latest == null || at > latest ? at : latest
    }, null),
  }
}

const compactPump = (row: any) => {
  const normalized = row?.normalized ?? {}
  return {
    fpId: normalized.fpId ?? row?.fpId ?? null,
    mainState: normalized.mainState ?? null,
    nozzleState: normalized.nozzleState ?? null,
    lockId: normalized.lockId ?? null,
    gradeId: normalized.gradeId ?? null,
    nozzleNumber: normalized.nozzleNumber ?? null,
    flags: normalized.flags ?? {},
    severity:
      normalized.flags?.isInErrorState || normalized.flags?.isEstopped
        ? 'error'
        : normalized.flags?.isOnline === false
          ? 'warning'
          : 'ok',
    ageMs: ageMs(row?.at),
  }
}

const compactTank = (row: any) => {
  const normalized = row?.normalized ?? {}
  return {
    tgId: normalized.tgId ?? row?.tgId ?? null,
    mainState: normalized.mainState ?? null,
    flags: normalized.flags ?? {},
    activeAlarms: normalized.activeAlarms ?? [],
    severity:
      normalized.flags?.errorActive || normalized.flags?.TankGaugeErrorActive
        ? 'error'
        : normalized.flags?.alarmActive ||
            asArray(normalized.activeAlarms).length
          ? 'warning'
          : 'ok',
    ageMs: ageMs(row?.at),
  }
}

const compactOptionalDevice = (row: any, idKey: string) => {
  const normalized = row?.normalized ?? {}
  const snapshot = normalized.snapshot ?? normalized
  return {
    deviceId: snapshot?.deviceId ?? normalized?.[idKey] ?? row?.[idKey] ?? null,
    family: snapshot?.family ?? null,
    mainState: snapshot?.mainState ?? normalized?.mainState ?? null,
    operationalStatus: snapshot?.operationalStatus ?? null,
    severity:
      snapshot?.severity ?? severityFromStatus(snapshot?.operationalStatus),
    ageMs: ageMs(row?.at),
  }
}

const countBySeverity = (rows: Array<{ severity?: string | null }>) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    const severity = String(row.severity ?? 'unknown')
    acc[severity] = (acc[severity] ?? 0) + 1
    return acc
  }, {})

export async function getDomsRuntimeDomainSnapshot(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const state = getJplAdapterState() as any
  const connectionAge = ageMs(state.lastMessageAt)
  const timeoutMs = Number(state.deadConnectionTimeoutMs ?? 30_000)
  const stale = connectionAge != null && connectionAge > timeoutMs

  const pumps = asArray(state.lastFpStatuses).map(compactPump)
  const tanks = asArray(state.lastTgStatuses).map(compactTank)
  const pricePoles = asArray(state.lastPpStatuses).map((row) =>
    compactOptionalDevice(row, 'ppId'),
  )
  const digitalIoPins = asArray(state.lastDigitalIoStatuses).map((row) =>
    compactOptionalDevice(row, 'diopId'),
  )
  const sensors = asArray(state.lastSensorStatuses).map((row) =>
    compactOptionalDevice(row, 'sensorId'),
  )
  const vendingMachines = asArray(state.lastVendingStatuses).map((row) =>
    compactOptionalDevice(row, 'vmId'),
  )

  return {
    ok: true,
    stationId: normalizedStationId,
    generatedAt: new Date().toISOString(),
    connection: {
      connected: Boolean(state.connected),
      loggedOn: Boolean(state.loggedOn),
      secureMode: Boolean(state.secureMode),
      posId: state.posId ?? null,
      welcomeVersion: state.welcomeVersion ?? null,
      reconnectAttempts: Number(state.reconnectAttempts ?? 0),
      lastMessageAgeMs: connectionAge,
      deadConnectionTimeoutMs: timeoutMs,
      stale,
      lastError: state.lastError ?? null,
      lastReject: state.lastReject ?? null,
      lastFrameDiagnostic: state.lastFrameDiagnostic ?? null,
    },
    forecourt: {
      fcStatus: state.lastFcStatus ?? null,
      installStatus: state.lastInstallStatus ?? null,
      posConnectionStatus: state.lastPosConnectionStatus ?? null,
      pssPeripheralsStatus: state.lastPssPeripheralsStatus ?? null,
    },
    dispense: {
      summary: summarizeList(asArray(state.lastFpStatuses), 'fpId'),
      severityCounts: countBySeverity(pumps),
      pumps,
      recentInfo: asArray(state.lastFpInfo).slice(0, 10),
      recentFuellingData: asArray(state.lastFpFuellingData).slice(0, 10),
      recentErrors: asArray(state.lastFpErrors).slice(0, 10),
    },
    wetstock: {
      summary: summarizeList(asArray(state.lastTgStatuses), 'tgId'),
      severityCounts: countBySeverity(tanks),
      tanks,
      recentTankData: asArray(state.lastTgData).slice(0, 20),
      siteDeliveryStatus: state.lastSiteDeliveryStatus ?? null,
      recentTankDeliveryData: asArray(state.lastTankDeliveryData).slice(0, 20),
    },
    optionalModules: {
      pricePoles: {
        summary: summarizeList(asArray(state.lastPpStatuses), 'ppId'),
        severityCounts: countBySeverity(pricePoles),
        devices: pricePoles,
        recentErrors: asArray(state.lastPpErrors).slice(0, 10),
      },
      wash: {
        summary: summarizeList(asArray(state.lastWashStatuses), 'wpId'),
        devices: asArray(state.lastWashStatuses).map((row) => ({
          wpId: row?.normalized?.wpId ?? row?.wpId ?? null,
          mainState: row?.normalized?.mainState ?? null,
          flags: row?.normalized?.flags ?? {},
          ageMs: ageMs(row?.at),
        })),
        recentTransactions: asArray(state.lastWashTransactions).slice(0, 20),
        recentErrors: asArray(state.lastWashErrors).slice(0, 10),
      },
      digitalIo: {
        summary: summarizeList(asArray(state.lastDigitalIoStatuses), 'diopId'),
        severityCounts: countBySeverity(digitalIoPins),
        devices: digitalIoPins,
      },
      sensors: {
        summary: summarizeList(asArray(state.lastSensorStatuses), 'sensorId'),
        severityCounts: countBySeverity(sensors),
        devices: sensors,
      },
      vending: {
        summary: summarizeList(asArray(state.lastVendingStatuses), 'vmId'),
        severityCounts: countBySeverity(vendingMachines),
        devices: vendingMachines,
        recentErrors: asArray(state.lastVendingErrors).slice(0, 10),
        recentTotals: asArray(state.lastVendingTotals).slice(0, 10),
      },
    },
    specialRecords: {
      serviceMessages: asArray(state.lastServiceMessages).slice(0, 10),
      backOfficeRecords: asArray(state.lastBackOfficeRecords).slice(0, 10),
    },
    parserCoverage: {
      supportedResponseNames: supportedJplResponseNames(),
      supportedResponseCount: supportedJplResponseNames().length,
    },
  }
}
