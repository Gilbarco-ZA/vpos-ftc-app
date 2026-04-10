import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { createManualTransaction } from '@/src/modules/transactions/application/commands/create-manual-transaction'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ManualLinePayload = {
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

type ManualTransactionBody = {
  csrf_token?: string
  pumpNumber?: number | string
  posReference?: string
  transactionDateTime?: string
  lines?: ManualLinePayload[]
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

export const POST = defineMutationRoute<ManualTransactionBody>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const result = await createManualTransaction(user.stationId, {
      pumpNumber: Number(body?.pumpNumber ?? 0),
      posReference: String(body?.posReference || '').trim() || null,
      transactionDateTime:
        String(body?.transactionDateTime || '').trim() || null,
      lines: Array.isArray(body?.lines)
        ? body.lines.map((line) => ({
            productId: String(line?.productId || '').trim(),
            quantity: Number(line?.quantity ?? 0),
            unitPrice:
              line?.unitPrice == null || line.unitPrice === ''
                ? null
                : Number(line.unitPrice),
          }))
        : [],
      fuelSelection: parseFuelSelection(body?.fuelSelection),
    })
    return ok(result)
  },
})
