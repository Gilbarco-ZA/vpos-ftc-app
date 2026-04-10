import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { ensureTransactionFuelLine } from '@/src/modules/transactions/application/commands/ensure-transaction-fuel-line'
import { replaceTransactionLines } from '@/src/modules/transactions/application/commands/replace-transaction-lines'
import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'
import { getTransactionEditableLines } from '@/src/modules/transactions/application/queries/get-transaction-editable-lines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LinePayload = {
  productId?: string
  quantity?: number | string
  unitPrice?: number | string | null
}

type FuelSelectionPayload = {
  tankId?: string
  nozzleId?: string
  nozzleNumber?: number | string | null
  gradeId?: string
  gradeName?: string
  pumpId?: string
}

type UpdateLinesBody = {
  csrf_token?: string
  lines?: LinePayload[]
  removedProductIds?: string[]
  fuelSelection?: FuelSelectionPayload | null
}

const parseFuelSelection = (value: FuelSelectionPayload | null | undefined) => {
  if (!value || typeof value !== 'object') return null
  const tankId = String(value.tankId || '').trim()
  const nozzleId = String(value.nozzleId || '').trim()
  const gradeId = String(value.gradeId || '').trim()
  const gradeName = String(value.gradeName || '').trim()
  const pumpId = String(value.pumpId || '').trim()
  const nozzleNumber =
    value.nozzleNumber == null || value.nozzleNumber === ''
      ? null
      : Number(value.nozzleNumber)

  return {
    tankId: tankId || null,
    nozzleId: nozzleId || null,
    nozzleNumber: Number.isFinite(nozzleNumber) ? nozzleNumber : null,
    gradeId: gradeId || null,
    gradeName: gradeName || null,
    pumpId: pumpId || null,
  }
}

export const GET = defineGetRoute<{ id: string }>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    const transactionId = String(params?.id || '').trim()
    await ensureTransactionFuelLine(user.stationId, transactionId)
    const [lines, transaction] = await Promise.all([
      getTransactionEditableLines(user.stationId, transactionId),
      getTransactionDetails(user.stationId, transactionId),
    ])
    return ok({
      lines,
      fuelSelection: transaction
        ? {
            tankId: transaction.tank_id ?? null,
            nozzleId: transaction.nozzle_id ?? null,
            nozzleNumber: transaction.nozzle_number ?? null,
            gradeId: transaction.grade_id ?? null,
            gradeName: transaction.grade_name ?? null,
          }
        : null,
    })
  },
})

export const POST = defineMutationRoute<UpdateLinesBody, { id: string }>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, params, body }) => {
    const result = await replaceTransactionLines(
      user.stationId,
      String(params?.id || '').trim(),
      Array.isArray(body?.lines)
        ? body.lines.map((line) => ({
            productId: String(line?.productId || '').trim(),
            quantity: Number(line?.quantity ?? 0),
            unitPrice:
              line?.unitPrice == null || line.unitPrice === ''
                ? null
                : Number(line.unitPrice),
          }))
        : [],
      Array.isArray(body?.removedProductIds)
        ? body.removedProductIds
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        : [],
      parseFuelSelection(body?.fuelSelection),
    )
    return ok(result)
  },
})
