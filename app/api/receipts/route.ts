import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { isPendingKenyaReceipt } from '@/src/modules/transactions/application/queries/is-pending-kenya-receipt'
import { getOrCreatePreFiscalizationReceipt } from '@/src/modules/transactions/infrastructure/fiscalization/preFiscalizationReceipt'
import { persistKenyaReceiptRefresh } from '@/src/modules/transactions/application/commands/persist-kenya-receipt-refresh'
import { refreshKenyaReceiptStatus } from '@/src/modules/transactions/application/queries/refresh-kenya-receipt-status'
import { prepareReceiptPreview } from '@/src/modules/transactions/application/commands/prepare-receipt-preview'
import {
  getReceiptRoutePayload,
  listReceiptRouteRows,
} from '@/src/modules/transactions/application/queries/get-receipt-route-data'

export const dynamic = 'force-dynamic'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator', 'field_engineer'])
    if (!user) return await serverError('User not found')

    const { searchParams } = new URL(req.url)
    const transactionId = (searchParams.get('transactionId') || '').trim()
    const listMode = (searchParams.get('list') || '').trim() === '1'
    const previewMode = (searchParams.get('preview') || '').trim() === '1'
    const refresh = (searchParams.get('refresh') || '').trim() === '1'

    if (transactionId && !listMode) {
      await prepareReceiptPreview({
        stationId: user.stationId,
        transactionId,
        previewMode,
      })

      const pendingKenya = await isPendingKenyaReceipt(user.stationId, transactionId)
      if (pendingKenya && !previewMode) {
        // A pending Kenya receipt must come from the canonical persisted offline
        // document, not a generic normalization of an unfinished transaction.
        try {
          await getOrCreatePreFiscalizationReceipt({
            stationId: user.stationId,
            transactionId,
          })
        } catch (error) {
          return fail(
            `Kenya offline receipt is unavailable: ${error instanceof Error ? error.message : 'receipt generation failed'}`,
            409,
          )
        }
      }

      let kenyaStatusRow: unknown = null
      let refreshWarning: string | undefined
      if (refresh && !previewMode) {
        try {
          kenyaStatusRow = await refreshKenyaReceiptStatus(user.stationId, transactionId)
        } catch (error) {
          // An unavailable/unmatched proxy status must not suppress the saved
          // offline receipt, nor be misreported as successful fiscalization.
          refreshWarning = `Kenya proxy status lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`
        }
      }
      const refreshedStatus =
        kenyaStatusRow && typeof kenyaStatusRow === 'object' && !Array.isArray(kenyaStatusRow)
          ? String((kenyaStatusRow as { status?: unknown }).status ?? '').trim().toUpperCase()
          : ''
      if (refreshedStatus === 'APPROVED') {
        try {
          await persistKenyaReceiptRefresh({
            stationId: user.stationId,
            transactionId,
            status: kenyaStatusRow,
          })
        } catch (error) {
          return fail(
            `Approved Kenya receipt could not be verified and saved: ${error instanceof Error ? error.message : 'unknown error'}`,
            502,
          )
        }
      }
      const result = await getReceiptRoutePayload({
        kenyaStatusRow,
        stationId: user.stationId,
        transactionId,
        previewMode,
        attendantName: user.fullName || user.username || undefined,
      })
      if (!result.found) {
        return NextResponse.json(
          { ok: false, error: result.error, raw: result.raw ?? null },
          { status: 404 },
        )
      }
      if (refreshWarning) result.payload.refreshWarning = refreshWarning
      return NextResponse.json(result.payload)
    }

    return ok(
      await listReceiptRouteRows(user.stationId, {
        transactionId,
        search: searchParams.get('search') || searchParams.get('q') || '',
        startDate: searchParams.get('startDate') || '',
        endDate: searchParams.get('endDate') || '',
        limit: Number(searchParams.get('limit') || 50),
        page: Number(searchParams.get('page') || 1),
        pageSize: Number(searchParams.get('pageSize') || searchParams.get('limit') || 50),
      }),
    )
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
