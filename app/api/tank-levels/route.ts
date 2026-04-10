import { created, fail, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { createStockEntry } from '@/src/modules/tank-levels/application/createTankStockEntry'
import { getTankLevelsSnapshot } from '@/src/modules/tank-levels/application/getTankLevelsSnapshot'
import {
  listTankInventoryMovements,
  listTankOptions,
} from '@/src/modules/tank-levels/application/listTankOptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user }) => {
    const [tanks, summary, recentMovements] = await Promise.all([
      listTankOptions(user.stationId),
      getTankLevelsSnapshot(user.stationId),
      listTankInventoryMovements(user.stationId),
    ])

    return ok({ tanks, summary, recentMovements })
  },
})

export const POST = defineMutationRoute<any>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const payload = body?.data ?? body
    const tankId = String(payload?.tankId ?? '').trim()
    const stockInType = String(payload?.stockInType ?? '').trim()
    const purchaseDate = String(payload?.purchaseDate ?? '').trim()
    const quantityLitres = toNumber(payload?.quantityLitres)
    const unitPrice = toNumber(payload?.unitPrice)

    if (!tankId) return fail('Tank is required', 400)
    if (!['StockCount', 'Delivery'].includes(stockInType)) {
      return fail('Stock type must be StockCount or Delivery', 400)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
      return fail('Purchase date must be in YYYY-MM-DD format', 400)
    }
    if (quantityLitres === null || quantityLitres <= 0) {
      return fail('Quantity must be greater than zero', 400)
    }
    if (unitPrice !== null && unitPrice < 0) {
      return fail('Unit price cannot be negative', 400)
    }

    const result = await createStockEntry({
      stationId: user.stationId,
      tankId,
      stockInType: stockInType as 'StockCount' | 'Delivery',
      purchaseDate,
      quantityLitres,
      unitPrice,
      supplierPin: payload?.supplierPin ?? null,
      supplierName: payload?.supplierName ?? null,
      supplierInvoiceNumber: payload?.supplierInvoiceNumber ?? null,
      documentId: payload?.documentId ?? null,
      createdByName:
        payload?.createdByName ?? user.fullName ?? user.username ?? user.email,
    })

    return created(result)
  },
})
