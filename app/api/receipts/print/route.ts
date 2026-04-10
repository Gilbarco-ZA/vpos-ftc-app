import type { SessionUser } from '@/src/shared/types'

import { readBody, toBool } from '@/src/platform/web/api/request'
import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { runPosControlCommand } from '@/src/modules/pos/application/runPosControlCommand'
import { markTransactionReceiptPrinted } from '@/src/modules/transactions/application/commands'
import { getLatestTransactionReceipt } from '@/src/modules/transactions/application/queries'

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const body = await readBody(req)

    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body.csrf_token,
    })

    const transactionId = String(body.transactionId || '').trim()
    const isReprint = toBool(body.isReprint, false) === true

    if (!transactionId) return fail('transactionId is required', 400)

    const receipt = await getLatestTransactionReceipt(
      user.stationId,
      transactionId,
    )
    if (!receipt) return fail('Receipt not found for transaction', 404)

    const printPayload = {
      type: 'receipt',
      copies: 1,
      correlationId: uuidv4(),
      idempotencyKey: `doms-receipt:${transactionId}:${receipt.id}:${isReprint ? 'reprint' : 'initial'}`,
      data: {
        source: 'vpos.transaction-receipt',
        transactionId,
        receiptId: String(receipt.id),
        receiptNumber: receipt.receipt_number,
        isReprint,
        htmlContent: receipt.html_content,
        plainTextContent: receipt.plain_text_content ?? '',
      },
    }

    const printResult = await runPosControlCommand({
      stationId: user.stationId,
      command: 'print',
      body: printPayload,
    })

    await markTransactionReceiptPrinted({
      stationId: user.stationId,
      transactionId,
      receiptId: String(receipt.id),
      userId: user.id,
      isReprint,
    })

    return ok({
      receiptId: receipt.id,
      receiptNumber: receipt.receipt_number,
      htmlContent: receipt.html_content,
      plainTextContent: receipt.plain_text_content,
      print: printResult,
    })
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('CSRF')) return fail('CSRF validation failed', 403)
    if (
      err?.code === 'POS_BACKEND_DISABLED' ||
      err?.code === 'NOT_CONFIGURED'
    ) {
      return fail(
        'POS receipt printing is not configured for this station',
        409,
        undefined,
        { code: err?.code },
      )
    }
    if (typeof err?.status === 'number') {
      return fail(
        'POS receipt print failed',
        err.status >= 500 ? 502 : err.status,
        undefined,
        { code: err?.code, details: err?.details ?? null },
      )
    }
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
