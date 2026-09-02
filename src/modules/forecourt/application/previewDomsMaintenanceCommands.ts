import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { prepareJplOutboundMessage } from '../infrastructure/jpl/protocol/schema'
import { recordForecourtEvent } from '../infrastructure/persistence'
import { getDomsMaintenanceExecutionPolicy } from './domsMaintenanceExecutionPolicy'
import { requireApprovedDomsMaintenanceSession } from './domsMaintenanceSessions'
import { getDomsConfigurationReconciliation } from './getDomsConfigurationReconciliation'

export type PreviewDomsMaintenanceCommandsInput = {
  sessionId?: unknown
  note?: unknown
  confirmApprovedMaintenanceSession?: unknown
  confirmPreviewOnly?: unknown
  confirmNoDomsCommand?: unknown
  includeSnapshotReads?: unknown
  includeClearInstallPreviews?: unknown
  includeInstallFpPreviews?: unknown
}

type PreviewRisk = 'read-only' | 'high' | 'blocked'
type PreviewCategory =
  | 'snapshot-read'
  | 'clear-install-preview'
  | 'install-fp-preview'
  | 'manual-only'

type CommandPreview = {
  id: string
  category: PreviewCategory
  risk: PreviewRisk
  title: string
  description: string
  entityType?: string | null
  entityId?: string | number | null
  commandName?: string | null
  subCode?: string | null
  envelope?: Record<string, unknown> | null
  validationStatus: 'validated' | 'blocked'
  blockers: string[]
  sendsDomsCommand: false
  previewOnly: true
  safetyNote: string
}

const MAX_NOTE_LENGTH = 1000
const MAX_FP_INSTALL_PREVIEWS = 20

const requireTrue = (value: unknown, fieldName: string) => {
  if (value !== true) throw new Error(`${fieldName} must be confirmed`)
}

const parseOptionalNote = (value: unknown) => {
  if (value == null) return null
  const normalized = String(value).trim()
  if (!normalized) return null
  if (normalized.length > MAX_NOTE_LENGTH) {
    throw new Error(`note must be ${MAX_NOTE_LENGTH} characters or fewer`)
  }
  return normalized
}

const boolInput = (value: unknown, fallback: boolean) =>
  value == null ? fallback : value === true

const normalizeNumericText = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return null
  const parsed = Number.parseInt(text, 10)
  if (Number.isFinite(parsed) && parsed >= 0) return String(parsed)
  return text
}

const normalizeId2 = (value: unknown) => {
  const normalized = normalizeNumericText(value)
  if (normalized == null) throw new Error('ID2 value is required')
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99) {
    throw new Error(`ID2 value ${normalized} must be between 0 and 99`)
  }
  return String(parsed).padStart(2, '0')
}

const safeId = (value: unknown, fallback: string) => {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  return (
    text
      .split('')
      .map((char) => {
        const code = char.charCodeAt(0)
        const isNumber = code >= 48 && code <= 57
        const isUpper = code >= 65 && code <= 90
        const isLower = code >= 97 && code <= 122
        return isNumber || isUpper || isLower ? char : '-'
      })
      .join('')
      .slice(0, 80) || fallback
  )
}

const makePreview = (params: {
  id: string
  category: PreviewCategory
  risk: PreviewRisk
  title: string
  description: string
  entityType?: string | null
  entityId?: string | number | null
  request?: Record<string, unknown> | null
  blockers?: string[]
  safetyNote: string
}): CommandPreview => {
  const blockers = params.blockers ?? []
  if (!params.request || blockers.length) {
    return {
      id: params.id,
      category: params.category,
      risk: params.risk,
      title: params.title,
      description: params.description,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      commandName:
        params.request?.name != null ? String(params.request.name) : null,
      subCode:
        params.request?.subCode != null ? String(params.request.subCode) : null,
      envelope: params.request ?? null,
      validationStatus: 'blocked',
      blockers,
      sendsDomsCommand: false,
      previewOnly: true,
      safetyNote: params.safetyNote,
    }
  }

  try {
    const envelope = prepareJplOutboundMessage(params.request)
    return {
      id: params.id,
      category: params.category,
      risk: params.risk,
      title: params.title,
      description: params.description,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      commandName: String(envelope.name ?? ''),
      subCode: envelope.subCode != null ? String(envelope.subCode) : null,
      envelope,
      validationStatus: 'validated',
      blockers: [],
      sendsDomsCommand: false,
      previewOnly: true,
      safetyNote: params.safetyNote,
    }
  } catch (error: any) {
    return {
      id: params.id,
      category: params.category,
      risk: 'blocked',
      title: params.title,
      description: params.description,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      commandName:
        params.request?.name != null ? String(params.request.name) : null,
      subCode:
        params.request?.subCode != null ? String(params.request.subCode) : null,
      envelope: params.request,
      validationStatus: 'blocked',
      blockers: [error?.message || 'JPL preview validation failed'],
      sendsDomsCommand: false,
      previewOnly: true,
      safetyNote: params.safetyNote,
    }
  }
}

const snapshotReadPreviews = (): CommandPreview[] => [
  makePreview({
    id: 'read-fc-install-status-00',
    category: 'snapshot-read',
    risk: 'read-only',
    title: 'Read installation status',
    description:
      'Preview the FcInstallStatus request used to refresh installed controller device groups.',
    request: { name: 'FcInstallStatus_req', subCode: '00H', data: {} },
    safetyNote: 'Read-only command preview. This pass does not send it.',
  }),
  makePreview({
    id: 'read-all-fp-status',
    category: 'snapshot-read',
    risk: 'read-only',
    title: 'Read all fuelling point statuses',
    description:
      'Preview the FpStatus request with FpId 00 to collect all fuelling point status messages.',
    request: { name: 'FpStatus_req', subCode: '00H', data: { FpId: '00' } },
    safetyNote: 'Read-only command preview. This pass does not send it.',
  }),
  makePreview({
    id: 'read-all-tank-gauge-status',
    category: 'snapshot-read',
    risk: 'read-only',
    title: 'Read all tank gauge statuses',
    description:
      'Preview the TgStatus request with TgId 00 to refresh wetstock gauge status.',
    request: { name: 'TgStatus_req', subCode: '00H', data: { TgId: '00' } },
    safetyNote: 'Read-only command preview. This pass does not send it.',
  }),
]

const clearInstallPreviewForFp = (observedFpId: unknown, index: number) => {
  let request: Record<string, unknown> | null = null
  const blockers: string[] = []
  try {
    request = {
      name: 'clear_InstallData_req',
      subCode: '01H',
      data: {
        ExtendedInstallMsgCode: '0010H',
        FcDeviceId: normalizeId2(observedFpId),
      },
    }
  } catch (error: any) {
    blockers.push(error?.message || 'Unable to normalize observed DOMS FpId')
  }

  return makePreview({
    id: `clear-fp-install-${safeId(observedFpId, String(index + 1))}`,
    category: 'clear-install-preview',
    risk: 'high',
    title: `Preview clear install data for DOMS FpId ${observedFpId}`,
    description:
      'This is a high-risk clear_InstallData preview for a fuelling point observed in DOMS but not mapped in FTC. Use only for supervised PSS maintenance planning.',
    entityType: 'doms',
    entityId: observedFpId as any,
    request,
    blockers,
    safetyNote:
      'High-risk preview only. Actual execution remains disabled and would require a future implementation pass plus physical/PSS confirmation.',
  })
}

const buildInstallFpRequest = (pump: any, nozzles: any[]) => {
  const fpId = normalizeId2(
    pump?.domsFpId ?? pump?.doms_fp_id ?? pump?.pump_number,
  )
  const gradeOptions = nozzles.map((nozzle) => {
    const optionNo = Number.parseInt(
      String(
        nozzle?.domsGradeOptionId ??
          nozzle?.doms_grade_option_id ??
          nozzle?.nozzle_number,
      ),
      10,
    )
    return {
      FpGradeOptionNo: Number.isFinite(optionNo)
        ? optionNo
        : nozzle?.nozzle_number,
      FcGradeId: normalizeId2(nozzle?.domsGradeId ?? nozzle?.doms_grade_id),
      Tanks: [
        {
          TankId: normalizeId2(nozzle?.domsTankId ?? nozzle?.doms_tank_id),
          Part: '01',
        },
      ],
    }
  })

  return {
    name: 'install_Fp_req',
    subCode: '03H',
    data: {
      FpId: fpId,
      FpInstallPars: {
        PumpInterfaceType: 0,
        PssChannelNo: Number(pump?.doms_pss_port_no ?? 0),
        FpGradeOptions: gradeOptions,
        FpGradeOptionsPars: gradeOptions.map((option) => ({
          FpGradeOptionNo: option.FpGradeOptionNo,
          FcGradeId: option.FcGradeId,
          FpGradeOptionPars: {
            TankConnections: option.Tanks,
          },
        })),
      },
    },
  }
}

const installFpPreviewForPump = (
  pump: any,
  allNozzles: any[],
  index: number,
) => {
  const nozzles = allNozzles.filter(
    (nozzle) => String(nozzle?.pump_id) === String(pump?.id),
  )
  const blockers: string[] = []
  if (!nozzles.length)
    blockers.push('Pump has no FTC nozzle rows to build grade options')
  for (const nozzle of nozzles) {
    if (
      !normalizeNumericText(
        nozzle?.domsGradeOptionId ??
          nozzle?.doms_grade_option_id ??
          nozzle?.nozzle_number,
      )
    ) {
      blockers.push(
        `Nozzle ${nozzle?.nozzle_number ?? '?'} has no DOMS grade option ID`,
      )
    }
    if (!normalizeNumericText(nozzle?.domsGradeId ?? nozzle?.doms_grade_id)) {
      blockers.push(
        `Nozzle ${nozzle?.nozzle_number ?? '?'} has no DOMS grade ID`,
      )
    }
    if (!normalizeNumericText(nozzle?.domsTankId ?? nozzle?.doms_tank_id)) {
      blockers.push(
        `Nozzle ${nozzle?.nozzle_number ?? '?'} has no DOMS tank ID`,
      )
    }
  }

  let request: Record<string, unknown> | null = null
  if (!blockers.length) {
    try {
      request = buildInstallFpRequest(pump, nozzles)
    } catch (error: any) {
      blockers.push(error?.message || 'Unable to build install_Fp preview')
    }
  }

  return makePreview({
    id: `install-fp-${safeId(pump?.id, String(index + 1))}`,
    category: 'install-fp-preview',
    risk: blockers.length ? 'blocked' : 'high',
    title: `Preview install_Fp for pump ${pump?.pump_number ?? pump?.code ?? index + 1}`,
    description:
      'This preview shows the install_Fp SUBC 03 envelope that could be generated from FTC pump/nozzle/tank mappings. It must be compared with PSS Configurator before any future execution support is considered.',
    entityType: 'pump',
    entityId: pump?.id ?? null,
    request,
    blockers,
    safetyNote:
      'High-risk preview only. The app still does not send install_Fp or alter PSS configuration.',
  })
}

const buildClearInstallPreviews = (reconciliation: any) => {
  const observedFpIssues = (reconciliation?.issues ?? []).filter(
    (issue: any) => String(issue?.code ?? '') === 'observed-fp-unmapped',
  )
  const previews = observedFpIssues.map((issue: any, index: number) =>
    clearInstallPreviewForFp(issue?.entityId, index),
  )

  const manualOnlyIssues = (reconciliation?.issues ?? []).filter(
    (issue: any) => {
      const code = String(issue?.code ?? '')
      return (
        code === 'observed-tank-unmapped' ||
        code === 'nozzle-doms-tank-not-configured'
      )
    },
  )

  for (const issue of manualOnlyIssues) {
    previews.push(
      makePreview({
        id: `manual-${safeId(issue?.code, 'issue')}-${safeId(issue?.entityId, 'entity')}`,
        category: 'manual-only',
        risk: 'blocked',
        title: `Manual PSS review required: ${issue?.code ?? 'issue'}`,
        description: String(
          issue?.message ??
            'This issue cannot be safely converted into an install or clear-install envelope from FTC data alone.',
        ),
        entityType: issue?.entityType ?? null,
        entityId: issue?.entityId ?? null,
        request: null,
        blockers: [
          'FTC cannot safely derive a tank gauge/tank installation write command from this reconciliation issue.',
          'Use PSS Configurator/manual controller tooling for this item.',
        ],
        safetyNote:
          'Manual-only planning item. No JPL write envelope is generated.',
      }),
    )
  }

  return previews
}

const buildInstallFpPreviews = (reconciliation: any) => {
  const pumps = reconciliation?.ftc?.pumps ?? []
  const nozzles = reconciliation?.ftc?.nozzles ?? []
  return pumps
    .slice(0, MAX_FP_INSTALL_PREVIEWS)
    .map((pump: any, index: number) =>
      installFpPreviewForPump(pump, nozzles, index),
    )
}

export async function previewDomsMaintenanceCommands(
  input: PreviewDomsMaintenanceCommandsInput,
  user: SessionUser,
) {
  requireTrue(
    input.confirmApprovedMaintenanceSession,
    'confirmApprovedMaintenanceSession',
  )
  requireTrue(input.confirmPreviewOnly, 'confirmPreviewOnly')
  requireTrue(input.confirmNoDomsCommand, 'confirmNoDomsCommand')

  const sessionId = requireNonEmptyString(input.sessionId, 'sessionId')
  const note = parseOptionalNote(input.note)
  const session = await requireApprovedDomsMaintenanceSession({
    stationId: user.stationId,
    sessionId,
  })
  const executionPolicy = await getDomsMaintenanceExecutionPolicy(
    user.stationId,
  )
  const reconciliation = await getDomsConfigurationReconciliation(
    user.stationId,
  )
  const previews: CommandPreview[] = []

  if (boolInput(input.includeSnapshotReads, true)) {
    previews.push(...snapshotReadPreviews())
  }
  if (boolInput(input.includeClearInstallPreviews, true)) {
    previews.push(...buildClearInstallPreviews(reconciliation))
  }
  if (boolInput(input.includeInstallFpPreviews, true)) {
    previews.push(...buildInstallFpPreviews(reconciliation))
  }

  const summary = {
    total: previews.length,
    validated: previews.filter(
      (preview) => preview.validationStatus === 'validated',
    ).length,
    blocked: previews.filter(
      (preview) => preview.validationStatus === 'blocked',
    ).length,
    highRisk: previews.filter((preview) => preview.risk === 'high').length,
    readOnly: previews.filter((preview) => preview.risk === 'read-only').length,
    sendsDomsCommand: false,
  }

  const audit = await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_MAINTENANCE_COMMANDS_PREVIEWED',
    entityType: 'forecourt.domsMaintenanceCommandPreview',
    entityId: session.id ?? undefined,
    newValues: summary,
    metadata: {
      source: 'doms-maintenance-command-preview',
      sessionId: session.id,
      sessionRequestAuditLogId: session.requestAuditLogId,
      sessionApprovalAuditLogId: session.approvalAuditLogId,
      note,
      reconciliationGeneratedAt: reconciliation.generatedAt,
      safetyBoundary:
        'Command previews are not executable. No DOMS/PSS command was sent.',
      executionEnabled: false,
      sendsDomsCommand: false,
    },
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.maintenance_commands_previewed',
    payload: {
      auditLogId: audit.id,
      sessionId: session.id,
      userId: user.id,
      username: user.username,
      summary,
      note,
      sendsDomsCommand: false,
    },
  })

  return {
    success: true,
    stationId: user.stationId,
    generatedAt: new Date().toISOString(),
    session: {
      id: session.id,
      status: session.status,
      expiresAt: session.expiresAt,
      approvalAuditLogId: session.approvalAuditLogId,
    },
    auditLogId: audit.id,
    executionGate: {
      enabled: false,
      reason:
        'This endpoint builds validated preview envelopes only. DOMS/PSS command execution remains disabled.',
    },
    executionPolicy,
    safetyNotice:
      'Do not treat these previews as authorization to alter the PSS. Compare them against PSS Configurator and physical site wiring first.',
    summary,
    previews,
  }
}
