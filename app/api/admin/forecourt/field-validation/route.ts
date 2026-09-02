import type {
  RecordDomsFieldValidationCheckpointInput,
  RecordDomsFieldValidationCommandResultInput,
  RecordDomsFieldValidationEvidenceImportInput,
} from '@/src/modules/forecourt/application/getDomsFieldValidationReadiness'
import { NextResponse } from 'next/server'

import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  getDomsFieldValidationReadiness,
  recordDomsFieldValidationCheckpoint,
  recordDomsFieldValidationCommandResult,
  recordDomsFieldValidationEvidenceImport,
} from '@/src/modules/forecourt/application/getDomsFieldValidationReadiness'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const isCommandResult = (body: Record<string, any>) =>
  String(body?.action ?? '')
    .trim()
    .toLowerCase() === 'record-command-result'

const isEvidenceImport = (body: Record<string, any>) => {
  const action = String(body?.action ?? '')
    .trim()
    .toLowerCase()
  return (
    action === 'import-evidence' ||
    action === 'import_evidence' ||
    Array.isArray(body?.checkpoints) ||
    body?.evidenceType != null
  )
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return NextResponse.json({
      success: true,
      data: await getDomsFieldValidationReadiness(user.stationId),
    })
  },
})

export const POST = defineMutationRoute<
  | RecordDomsFieldValidationCheckpointInput
  | RecordDomsFieldValidationCommandResultInput
  | RecordDomsFieldValidationEvidenceImportInput
>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const bodyRecord = body as Record<string, any>
    const result = isCommandResult(bodyRecord)
      ? await recordDomsFieldValidationCommandResult(
          body as RecordDomsFieldValidationCommandResultInput,
          user,
        )
      : isEvidenceImport(bodyRecord)
        ? await recordDomsFieldValidationEvidenceImport(
            body as RecordDomsFieldValidationEvidenceImportInput,
            user,
          )
        : await recordDomsFieldValidationCheckpoint(
            body as RecordDomsFieldValidationCheckpointInput,
            user,
          )
    return NextResponse.json({ success: true, data: result })
  },
})
