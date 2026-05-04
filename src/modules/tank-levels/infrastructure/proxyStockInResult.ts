type ProxyStockInItemResult = {
  documentId?: string | null
  status?: string | null
  message?: string | null
  responseCode?: string | number | null
  error?: boolean | null
  success?: boolean | null
}

export type ProxyStockInAssessment = {
  ok: boolean
  message: string
  failedItems: ProxyStockInItemResult[]
}

const asArray = (value: unknown) => (Array.isArray(value) ? value : [])

const isFailedItem = (value: unknown): value is ProxyStockInItemResult => {
  if (!value || typeof value !== 'object') return false

  const item = value as ProxyStockInItemResult
  const status = String(item.status ?? '')
    .trim()
    .toUpperCase()

  return (
    item.error === true ||
    item.success === false ||
    status === 'FAILED' ||
    status === 'ERROR' ||
    status === 'REJECTED'
  )
}

const describeFailedItem = (item: ProxyStockInItemResult) => {
  const documentId = String(item.documentId ?? '').trim()
  const message = String(item.message ?? '').trim()

  if (documentId && message) return `StockIn ${documentId} failed: ${message}`
  if (documentId) return `StockIn ${documentId} failed`
  if (message) return message
  return 'Proxy reported a stock-in failure'
}

export function assessStockInProxyResponse(
  body: unknown,
): ProxyStockInAssessment {
  const payload = body && typeof body === 'object' ? (body as any) : null
  const failedItems = [
    ...asArray(payload?.stockIn),
    ...asArray(payload?.stockIns),
  ].filter(isFailedItem)

  if (failedItems.length > 0) {
    return {
      ok: false,
      message: failedItems.map(describeFailedItem).join('; '),
      failedItems,
    }
  }

  if (payload?.error === true || payload?.success === false) {
    return {
      ok: false,
      message: String(payload?.message || 'Proxy reported a stock-in failure'),
      failedItems: [],
    }
  }

  const responseCode = String(payload?.responseCode ?? '')
    .trim()
    .toUpperCase()
  if (
    responseCode &&
    responseCode !== '200' &&
    responseCode !== 'OFFLINE_SUCCESS'
  ) {
    return {
      ok: false,
      message: String(
        payload?.message ||
          `Proxy reported stock-in response code ${responseCode}`,
      ),
      failedItems: [],
    }
  }

  return {
    ok: true,
    message: 'Proxy accepted stock-in',
    failedItems: [],
  }
}
