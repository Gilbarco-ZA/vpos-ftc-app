import { getForecourtSettings } from '@/src/modules/forecourt/application/forecourtSettings'

import type {
  DomsCommissioningReadiness,
  DomsCommissioningStatus,
} from './domsCommissioningReadiness.helpers'
import { getDomsCommissioningChecklist } from './domsCommissioningChecklist'
import {
  buildDomsLegacyToJplRunbook,
  validateDomsLiveConnectionSettings,
} from './domsCommissioningReadiness.helpers'
import { getAdminForecourtDiagnostics } from './getAdminForecourtDiagnostics'
import { getDomsConfigurationReconciliation } from './getDomsConfigurationReconciliation'
import { getDomsFieldValidationReadiness } from './getDomsFieldValidationReadiness'

export {
  buildDomsFirstSiteCommissioningChecklist,
  buildDomsLegacyToJplRunbook,
  validateDomsLiveConnectionSettings,
  type DomsCommissioningCheck,
  type DomsCommissioningReadiness,
  type DomsCommissioningSeverity,
  type DomsCommissioningStatus,
  type DomsCommissioningStep,
} from './domsCommissioningReadiness.helpers'

const deriveConnected = (diagnostics: any) => {
  const connection = diagnostics?.connection ?? {}
  const adapterState = diagnostics?.adapterState ?? {}
  const status = String(
    connection.status ??
      adapterState.status ??
      adapterState.connectionStatus ??
      '',
  ).toLowerCase()
  return (
    connection.connected === true ||
    adapterState.connected === true ||
    status === 'connected' ||
    status === 'online'
  )
}

export async function getDomsCommissioningReadiness(
  stationId: string,
): Promise<DomsCommissioningReadiness> {
  const [
    settings,
    diagnostics,
    reconciliation,
    fieldValidation,
    commissioningChecklist,
  ] = await Promise.all([
    getForecourtSettings(stationId),
    getAdminForecourtDiagnostics(stationId).catch(() => null),
    getDomsConfigurationReconciliation(stationId).catch(() => null),
    getDomsFieldValidationReadiness(stationId).catch(() => null),
    getDomsCommissioningChecklist(stationId),
  ])

  const settingsValidation = validateDomsLiveConnectionSettings(settings)
  const connected = deriveConnected(diagnostics)
  const blockingValidationItems = Number(
    fieldValidation?.summary?.blockingItemCount ?? 0,
  )
  const liveWarnings = [
    connected ? null : 'No live JPL connection currently observed.',
    String(reconciliation?.severity ?? 'warning') === 'error'
      ? 'Reconciliation contains blocking errors.'
      : null,
    blockingValidationItems > 0
      ? 'Field validation still has blocking items.'
      : null,
  ].filter(Boolean)

  const status: DomsCommissioningStatus =
    settingsValidation.status === 'blocked' || liveWarnings.length > 1
      ? 'blocked'
      : settingsValidation.status === 'ready-with-warnings' ||
          liveWarnings.length > 0
        ? 'ready-with-warnings'
        : 'ready'

  return {
    status,
    generatedAt: new Date().toISOString(),
    settingsValidation,
    commissioningChecklist: commissioningChecklist.steps,
    commissioningChecklistSummary: commissioningChecklist.summary,
    legacyToJplRunbook: buildDomsLegacyToJplRunbook(),
    liveReadiness: {
      connected,
      reconciliationSeverity: String(reconciliation?.severity ?? 'unknown'),
      fieldValidationStatus: String(
        fieldValidation?.overallStatus ?? 'unknown',
      ),
      productionReleaseStatus: String(
        fieldValidation?.productionReleaseStatus ?? 'unknown',
      ),
      blockingValidationItems,
    },
  }
}
