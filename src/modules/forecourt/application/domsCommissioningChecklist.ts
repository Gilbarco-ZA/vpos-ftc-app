import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import type {
  DomsCommissioningChecklistSummary,
  DomsCommissioningStep,
} from './domsCommissioningReadiness.helpers'
import { recordForecourtEvent } from '../infrastructure/persistence'
import { buildDomsFirstSiteCommissioningChecklist } from './domsCommissioningReadiness.helpers'

const CHECKLIST_KV_KEY = 'forecourt.domsCommissioningChecklist.v1'

export type DomsCommissioningChecklistProgressItem = {
  completed: boolean
  notes: string
  completedAt: string | null
  completedByUserId: string | null
  completedByUsername: string | null
  updatedAt: string
}

export type DomsCommissioningChecklistProgress = {
  version: 1
  updatedAt: string | null
  items: Record<string, DomsCommissioningChecklistProgressItem>
}

export type UpdateDomsCommissioningChecklistInput = {
  stepId?: unknown
  completed?: unknown
  notes?: unknown
}

const emptyProgress = (): DomsCommissioningChecklistProgress => ({
  version: 1,
  updatedAt: null,
  items: {},
})

const normalizeNotes = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (text.length > 500) {
    throw new Error('notes must be 500 characters or less')
  }
  return text
}

const normalizeProgress = (
  value: DomsCommissioningChecklistProgress | null | undefined,
): DomsCommissioningChecklistProgress => {
  if (!value || typeof value !== 'object') return emptyProgress()
  const items =
    value.items && typeof value.items === 'object' ? value.items : {}
  return {
    version: 1,
    updatedAt: value.updatedAt ? String(value.updatedAt) : null,
    items,
  }
}

export async function getDomsCommissioningChecklistProgress(
  stationId: string,
): Promise<DomsCommissioningChecklistProgress> {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  return normalizeProgress(
    await kvGet<DomsCommissioningChecklistProgress>(
      normalizedStationId,
      CHECKLIST_KV_KEY,
    ),
  )
}

export const mergeDomsCommissioningChecklistProgress = (
  steps: DomsCommissioningStep[],
  progress: DomsCommissioningChecklistProgress,
): DomsCommissioningStep[] =>
  steps.map((step) => {
    const saved = progress.items[step.id]
    return {
      ...step,
      completed: saved?.completed === true,
      notes: saved?.notes ?? '',
      completedAt: saved?.completedAt ?? null,
      completedByUserId: saved?.completedByUserId ?? null,
      completedByUsername: saved?.completedByUsername ?? null,
    }
  })

export const summarizeDomsCommissioningChecklist = (
  steps: DomsCommissioningStep[],
  updatedAt: string | null,
): DomsCommissioningChecklistSummary => {
  const total = steps.length
  const completed = steps.filter((step) => step.completed).length
  const required = steps.filter((step) => step.required)
  const requiredCompleted = required.filter((step) => step.completed).length
  return {
    total,
    completed,
    requiredTotal: required.length,
    requiredCompleted,
    percentComplete: total ? Math.round((completed / total) * 100) : 0,
    requiredPercentComplete: required.length
      ? Math.round((requiredCompleted / required.length) * 100)
      : 0,
    updatedAt,
  }
}

export async function getDomsCommissioningChecklist(stationId: string) {
  const progress = await getDomsCommissioningChecklistProgress(stationId)
  const steps = mergeDomsCommissioningChecklistProgress(
    buildDomsFirstSiteCommissioningChecklist(),
    progress,
  )
  return {
    steps,
    summary: summarizeDomsCommissioningChecklist(steps, progress.updatedAt),
  }
}

export async function updateDomsCommissioningChecklist(
  input: UpdateDomsCommissioningChecklistInput,
  user: SessionUser,
) {
  const stepId = requireNonEmptyString(input?.stepId, 'stepId')
  const knownStep = buildDomsFirstSiteCommissioningChecklist().find(
    (step) => step.id === stepId,
  )
  if (!knownStep) throw new Error('Unknown commissioning checklist step')
  if (typeof input?.completed !== 'boolean') {
    throw new Error('completed must be a boolean')
  }

  const progress = await getDomsCommissioningChecklistProgress(user.stationId)
  const previous = progress.items[stepId]
  const now = new Date().toISOString()
  const completed = input.completed
  const nextItem: DomsCommissioningChecklistProgressItem = {
    completed,
    notes: normalizeNotes(input.notes ?? previous?.notes ?? ''),
    completedAt: completed ? (previous?.completedAt ?? now) : null,
    completedByUserId: completed ? user.id : null,
    completedByUsername: completed ? user.username : null,
    updatedAt: now,
  }
  const next: DomsCommissioningChecklistProgress = {
    version: 1,
    updatedAt: now,
    items: {
      ...progress.items,
      [stepId]: nextItem,
    },
  }

  await kvSet(user.stationId, CHECKLIST_KV_KEY, next)

  await Promise.allSettled([
    createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'DOMS_COMMISSIONING_CHECKLIST_UPDATED',
      entityType: 'forecourt.domsCommissioningChecklist',
      entityId: undefined,
      oldValues: previous ?? {},
      newValues: nextItem,
      metadata: {
        username: user.username,
        stepId,
        title: knownStep.title,
        sendsDomsCommand: false,
      },
    }),
    recordForecourtEvent({
      stationId: user.stationId,
      source: 'admin',
      eventType: 'doms.commissioning_checklist_updated',
      payload: {
        stepId,
        title: knownStep.title,
        completed,
        userId: user.id,
        username: user.username,
        updatedAt: now,
        sendsDomsCommand: false,
      },
    }),
  ])

  return await getDomsCommissioningChecklist(user.stationId)
}
