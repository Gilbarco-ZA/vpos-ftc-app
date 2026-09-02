import type { SessionUser } from '@/src/shared/types'

import { readBody, toBool } from '@/src/platform/web/api/request'
import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { runPosControlCommand } from '@/src/modules/pos/application/runPosControlCommand'
import { getPrintJobStatus } from '@/src/modules/printing/application/getPrintJobStatus'
import { resolveReceiptPrinter } from '@/src/modules/printing/application/resolveReceiptPrinter'
import { markTransactionReceiptPrinted } from '@/src/modules/transactions/application/commands'
import {
  getOrCreateLatestTransactionReceipt,
  getTransactionReceipt,
} from '@/src/modules/transactions/application/queries'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator'])
    if (!user) return await serverError('User not found')

    const { searchParams } = new URL(req.url)
    const jobId = String(searchParams.get('jobId') || '').trim()
    const transactionId = String(searchParams.get('transactionId') || '').trim()
    const receiptId = String(searchParams.get('receiptId') || '').trim()
    const isReprint = toBool(searchParams.get('isReprint'), false) === true

    if (!jobId) return fail('jobId is required', 400)
    if (!transactionId) return fail('transactionId is required', 400)

    const job = await getPrintJobStatus(user.stationId, jobId)
    if (!job || String(job.source_transaction_id || '') !== transactionId) {
      return fail('Print job not found', 404)
    }

    const status = String(job.status || '').toUpperCase()
    if (status === 'DONE' && receiptId) {
      await markTransactionReceiptPrinted({
        stationId: user.stationId,
        transactionId,
        receiptId,
        userId: user.id,
        isReprint,
      })
    }

    return ok({
      jobId: job.id,
      status,
      completed: status === 'DONE' || status === 'FAILED',
      success: status === 'DONE',
      error: status === 'FAILED' ? job.last_error || 'Receipt print failed' : null,
      completedAt: job.completed_at ?? null,
    })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

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

    const receipt = await getOrCreateLatestTransactionReceipt(
      user.stationId,
      transactionId,
    )
    if (!receipt) return fail('Receipt not found for transaction', 404)
    const currentReceipt = await getTransactionReceipt(
      user.stationId,
      transactionId,
    )

    const { pumpNumber, printer: resolvedPrinter } =
      await resolveReceiptPrinter({
        stationId: user.stationId,
        transactionId,
      })

    if (!resolvedPrinter) {
      return fail(
        'No printer is configured for this station. Set one up in Admin → Printers and enable it.',
        409,
        undefined,
        { code: 'NO_PRINTER_CONFIGURED' },
      )
    }

    const correlationId = uuidv4()
    const printPayload = {
      type: 'receipt',
      copies: 1,
      correlationId,
      idempotencyKey: isReprint
        ? `doms-receipt:${transactionId}:${receipt.id}:reprint:${correlationId}`
        : `doms-receipt:${transactionId}:${receipt.id}:initial`,
      // Keep only the configured printer identity on the job. The worker resolves
      // host/port/width/timeout from device_configs, matching Admin → Printers.
      printerKey: resolvedPrinter.deviceKey || undefined,
      pumpNumber: pumpNumber ?? undefined,
      data: {
        source: 'vpos.transaction-receipt',
        transactionId,
        receiptId: String(receipt.id),
        receiptNumber: currentReceipt?.receiptNumber ?? receipt.receipt_number,
        isReprint,
        pumpNumber: pumpNumber ?? undefined,
      },
    }

    const printResult = await runPosControlCommand({
      stationId: user.stationId,
      command: 'print',
      body: printPayload,
    })

    return ok({
      receiptId: receipt.id,
      receiptNumber: currentReceipt?.receiptNumber ?? receipt.receipt_number,
      htmlContent: currentReceipt?.htmlContent ?? receipt.html_content,
      plainTextContent:
        currentReceipt?.plainTextContent ?? receipt.plain_text_content,
      print: printResult,
      printJobId: (printResult as any)?.printJobId ?? null,
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
