import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'
import { getStationDecimalSettings } from '@/src/shared/server/decimalSettings'

import { listFiscalizedTransactions } from '@/src/modules/transactions/application/queries/list-fiscalized-transactions'

import { PageHeader } from '@/components/layout/page-header'
import ReceiptViewerClient from '@/components/receipts/ReceiptViewerClient'
import FiscalizedTransactionsManagerClient, {
  ManagerFiscalizedRow,
} from '@/components/transactions/FiscalizedTransactionsManagerClient'
import FiscalizedTransactionsPageClient, {
  FiscalizedTransactionListItem,
} from '@/components/transactions/FiscalizedTransactionsPageClient'
import { TransactionsStatusToggle } from '@/components/transactions/TransactionsStatusToggle'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export type FiscalizedRole = 'manager' | 'administrator'

type SearchParams = Record<string, string | string[] | undefined>

type TxnRow = any

const readParam = (params: SearchParams, key: string) => {
  const value = params[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

const authHeaders = () => {
  const store = cookies()
  const cookie = store
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join('; ')
  return cookie ? { cookie } : undefined
}

const loadManagerTransactions = async (opts: {
  page?: number
  pageSize?: number
  transactionId?: string
}) => {
  const params = new URLSearchParams()
  params.set('page', String(opts.page ?? 1))
  params.set('pageSize', String(opts.pageSize ?? 50))
  params.set('status', 'FISCALIZED')
  params.set('includeCustomer', '1')
  if (opts.transactionId) params.set('transactionId', opts.transactionId)

  const res = await fetch(`/api/transactions?${params.toString()}`, {
    cache: 'no-store',
    headers: authHeaders() ?? undefined,
  })
  if (!res.ok) return { items: [], total: 0, page: 1, pageSize: 50 }
  const body = await res.json().catch(() => ({}))
  const payload = body?.data ?? body
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : []
  return {
    items,
    total: Number(payload?.total ?? items.length),
    page: Number(payload?.page ?? 1),
    pageSize: Number((payload?.pageSize ?? items.length) || 50),
  }
}

const normalizeAdminRows = (items: any[]): FiscalizedTransactionListItem[] => {
  return items.map((item: any) => ({
    id: String(item?.id ?? ''),
    fiscalizedAt: item?.fiscalized_at ?? item?.fiscalizedAt ?? null,
    transactionDateTime:
      item?.transaction_date_time ?? item?.transactionDateTime ?? null,
    posReference: item?.pos_reference ?? item?.posReference ?? null,
    cloudTransactionId:
      item?.cloud_transaction_id ?? item?.cloudTransactionId ?? null,
    pumpNumber: Number(item?.pump_number ?? item?.pumpNumber ?? 0),
    fuelType: item?.fuel_type ?? item?.fuelType ?? null,
    volume: item?.volume ?? null,
    totalAmount: Number(item?.total_amount ?? item?.totalAmount ?? 0),
    status: String(item?.status ?? ''),
    fiscalizationReference:
      item?.fiscalization_reference ?? item?.fiscalizationReference ?? null,
    buyerName: item?.buyer_name ?? item?.buyerName ?? null,
    tin: item?.tin ?? null,
  }))
}

const ReceiptViewerView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['manager', 'administrator'])
  if (!['administrator', 'manager'].includes(user.role)) redirect('/dashboard')

  const initialQuery = readParam(searchParams, 'q').trim()
  const initialTransactionId = readParam(searchParams, 'transactionId').trim()
  const autoPrint = readParam(searchParams, 'print').trim() === '1'

  return (
    <ReceiptViewerClient
      initialQuery={initialQuery}
      initialTransactionId={initialTransactionId}
      autoPrint={autoPrint}
    />
  )
}

const AdminFiscalizedView = async () => {
  const user = await requireAuth(['manager', 'administrator'])
  if (!['administrator', 'manager'].includes(user.role)) redirect('/dashboard')

  let rows: FiscalizedTransactionListItem[] = []
  let error: string | null = null
  const decimals = await getStationDecimalSettings(user.stationId)

  try {
    const list = await listFiscalizedTransactions(user.stationId)
    rows = normalizeAdminRows(list)
  } catch (err: any) {
    error = err?.message ?? 'Failed to load transactions'
  }

  return (
    <FiscalizedTransactionsPageClient
      initialTransactions={rows}
      error={error}
      decimals={decimals}
    />
  )
}

const ManagerFiscalizedView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['manager', 'administrator'])
  if (user.role !== 'manager' && user.role !== 'administrator')
    redirect('/dashboard')

  const page = Number(readParam(searchParams, 'page') || '1') || 1
  const transactionId = readParam(searchParams, 'transactionId').trim()

  const data = await loadManagerTransactions({
    page,
    pageSize: 50,
    transactionId: transactionId || undefined,
  })

  const rows: TxnRow[] = data.items || data || []
  const total = data.total ?? rows.length

  const nextPage = page + 1
  const prevPage = Math.max(1, page - 1)
  const decimals = await getStationDecimalSettings(user.stationId)

  const mapped: ManagerFiscalizedRow[] = rows.map((t) => ({
    id: String((t as any)?.id ?? ''),
    fiscalizedAt:
      (t as any)?.fiscalized_at ?? (t as any)?.transaction_date_time ?? null,
    pumpNumber: Number((t as any)?.pump_number ?? 0),
    totalAmount: Number((t as any)?.total_amount ?? 0),
    buyerName: (t as any)?.customer_buyer_name ?? null,
    tin: (t as any)?.customer_tin ?? null,
    fiscalizationReference: (t as any)?.fiscalization_reference ?? null,
    status: (t as any)?.status ?? null,
  }))

  const prevHref = `/transactions?status=fiscalized&page=${prevPage}${transactionId ? `&transactionId=${encodeURIComponent(transactionId)}` : ''}`
  const nextHref = `/transactions?status=fiscalized&page=${nextPage}${transactionId ? `&transactionId=${encodeURIComponent(transactionId)}` : ''}`

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fiscalized transactions"
        description="Transactions with status FISCALIZED. Use View receipt to open the rendered receipt."
        actions={<TransactionsStatusToggle active="fiscalized" />}
      />

      <form
        className="flex flex-wrap items-center gap-2"
        method="get"
        action="/transactions?status=fiscalized"
      >
        <Input
          name="transactionId"
          defaultValue={transactionId}
          placeholder="Transaction ID (optional)"
          className="w-full max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm text-[var(--text-secondary)]">
          Showing page {page} - {rows.length} rows - {total} total
        </div>
      </Card>

      <FiscalizedTransactionsManagerClient
        rows={mapped}
        prevHref={prevHref}
        nextHref={nextHref}
        decimals={decimals}
      />
    </div>
  )
}

export const FiscalizedTransactionsRolePage = async ({
  role,
  searchParams,
}: {
  role: FiscalizedRole
  searchParams: SearchParams
}) => {
  const view = readParam(searchParams, 'view').trim()
  if (view === 'receipt') {
    return <ReceiptViewerView searchParams={searchParams} />
  }

  if (role === 'administrator') {
    return <AdminFiscalizedView />
  }

  return <ManagerFiscalizedView searchParams={searchParams} />
}
