type ReceiptPrintResult = {
  success: boolean
  status: string
  error?: unknown
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export async function printReceiptAndWait(args: {
  csrfToken: string
  transactionId: string
  isReprint?: boolean
  timeoutMs?: number
}): Promise<ReceiptPrintResult> {
  const isReprint = args.isReprint !== false
  const res = await fetch('/api/receipts/print', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': args.csrfToken,
    },
    body: JSON.stringify({
      csrf_token: args.csrfToken,
      transactionId: args.transactionId,
      isReprint,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.ok === false) {
    return {
      success: false,
      status: 'FAILED',
      error: res.ok ? body : { status: res.status, body },
    }
  }

  const payload = body?.data ?? body
  const jobId = String(payload?.printJobId ?? payload?.print?.printJobId ?? '').trim()
  const receiptId = String(payload?.receiptId ?? '').trim()
  if (!jobId) {
    return {
      success: false,
      status: 'FAILED',
      error: { message: 'Print job ID was not returned' },
    }
  }

  const deadline = Date.now() + Math.max(5_000, args.timeoutMs ?? 20_000)
  while (Date.now() < deadline) {
    await sleep(350)
    const params = new URLSearchParams({
      jobId,
      transactionId: args.transactionId,
      receiptId,
      isReprint: isReprint ? '1' : '0',
    })
    const statusRes = await fetch(`/api/receipts/print?${params.toString()}`, {
      cache: 'no-store',
    })
    const statusBody = await statusRes.json().catch(() => ({}))
    if (!statusRes.ok || statusBody?.ok === false) {
      return {
        success: false,
        status: 'FAILED',
        error: statusRes.ok
          ? statusBody
          : { status: statusRes.status, body: statusBody },
      }
    }
    const statusPayload = statusBody?.data ?? statusBody
    const status = String(statusPayload?.status ?? '').toUpperCase()
    if (status === 'DONE') return { success: true, status }
    if (status === 'FAILED') {
      return {
        success: false,
        status,
        error: { message: statusPayload?.error || 'Receipt print failed' },
      }
    }
  }

  return {
    success: false,
    status: 'TIMEOUT',
    error: { message: 'Timed out waiting for the printer to confirm completion' },
  }
}
