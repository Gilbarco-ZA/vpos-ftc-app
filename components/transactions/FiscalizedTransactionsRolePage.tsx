import { redirect } from 'next/navigation'
import { getStationCountryCode, isTanzaniaCountry } from '@/src/modules/tanzania-fiscal/infrastructure/country'

import { requireAuth } from '@/src/shared/auth'
import { resolveDateFilter } from '@/src/shared/crud/dateFilters'
import { getStationDecimalSettings } from '@/src/shared/server/decimalSettings'
import { getStationCurrentBusinessDate } from '@/src/shared/server/stationBusinessDate'

import { listTransactions } from '@/src/modules/transactions/application/queries/list-transactions'

import { ListToolbar } from '@/components/crud/ListToolbar'
import { PageHeader } from '@/components/layout/page-header'
import ReceiptViewerClient from '@/components/receipts/ReceiptViewerClient'
import FiscalizedTransactionsManagerClient, {
  ManagerFiscalizedRow,
} from '@/components/transactions/FiscalizedTransactionsManagerClient'
import FiscalizedTransactionsPageClient, {
  FiscalizedTransactionListItem,
} from '@/components/transactions/FiscalizedTransactionsPageClient'
import { TransactionsStatusToggle } from '@/components/transactions/TransactionsStatusToggle'
import { Card } from '@/components/ui/card'

export type FiscalizedRole = 'manager' | 'administrator'

type SearchParams = Record<string, string | string[] | undefined>

type TxnRow = any

const readParam = (params: SearchParams, key: string) => {
  const value = params[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

const normalizeAdminRows = (items: any[]): FiscalizedTransactionListItem[] => {
  return items.map((item: any) => ({
    id: String(item?.id ?? ''),
    fiscalizedAt: item?.fiscalized_at ?? item?.fiscalizedAt ?? null,
    transactionDateTime:
      item?.transaction_date_time ?? item?.transactionDateTime ?? null,
    posReference: item?.pos_reference ?? item?.posReference ?? null,
    receiptNumber: item?.receipt_number ?? item?.receiptNumber ?? null,
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
  const user = await requireAuth(['manager', 'administrator', 'field_engineer'])
  if (!['administrator', 'manager', 'field_engineer'].includes(user.role)) redirect('/dashboard')

  const initialQuery = readParam(searchParams, 'q').trim()
  const initialTransactionId = readParam(searchParams, 'transactionId').trim()
  const autoPrint = readParam(searchParams, 'print').trim() === '1'
  const businessDate = await getStationCurrentBusinessDate(user.stationId)
  const dateFilter = resolveDateFilter(
    {
      startDate: readParam(searchParams, 'startDate'),
      endDate: readParam(searchParams, 'endDate'),
      preset: readParam(searchParams, 'preset'),
    },
    businessDate,
  )

  return (
    <ReceiptViewerClient
      initialQuery={initialQuery}
      initialTransactionId={initialTransactionId}
      autoPrint={autoPrint}
      initialFromDate={dateFilter.startDate}
      initialToDate={dateFilter.endDate}
      businessDate={businessDate}
    />
  )
}

const AdminFiscalizedView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['manager', 'administrator'])
  if (!['administrator', 'manager', 'field_engineer'].includes(user.role)) redirect('/dashboard')

  let rows: FiscalizedTransactionListItem[] = []
  let total = 0
  const page = Math.max(1, Number(readParam(searchParams, 'page') || '1') || 1)
  const requestedPageSize = Number(readParam(searchParams, 'pageSize') || '50')
  const pageSize = [10, 25, 50, 100].includes(requestedPageSize) ? requestedPageSize : 50
  let error: string | null = null
  const q = readParam(searchParams, 'q').trim()
  const [decimals, businessDate, stationCountry] = await Promise.all([
    getStationDecimalSettings(user.stationId),
    getStationCurrentBusinessDate(user.stationId),
    getStationCountryCode(user.stationId),
  ])
  const dateFilter = resolveDateFilter(
    {
      startDate: readParam(searchParams, 'startDate'),
      endDate: readParam(searchParams, 'endDate'),
      preset: readParam(searchParams, 'preset'),
    },
    businessDate,
  )

  try {
    const list = await listTransactions(user.stationId, {
      scope: 'fiscalized',
      page,
      pageSize,
      search: q || undefined,
      startDate: dateFilter.startDate || undefined,
      endDate: dateFilter.endDate || undefined,
    })
    rows = normalizeAdminRows(Array.isArray(list?.items) ? list.items : [])
    total = Number(list?.total ?? rows.length)
  } catch (err: any) {
    error = err?.message ?? 'Failed to load transactions'
  }

  return (
    <FiscalizedTransactionsPageClient
      allowCreditNotes={!isTanzaniaCountry(stationCountry)}
      initialTransactions={rows}
      initialPage={page}
      initialPageSize={pageSize}
      initialTotal={total}
      error={error}
      decimals={decimals}
      initialSearch={q}
      initialStartDate={dateFilter.startDate}
      initialEndDate={dateFilter.endDate}
      businessDate={businessDate}
    />
  )
}

const ManagerFiscalizedView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['manager', 'administrator'])
  if (!['manager', 'administrator', 'field_engineer'].includes(user.role))
    redirect('/dashboard')

  const page = Math.max(1, Number(readParam(searchParams, 'page') || '1') || 1)
  const requestedPageSize = Number(readParam(searchParams, 'pageSize') || '50')
  const pageSize = [10, 25, 50, 100].includes(requestedPageSize) ? requestedPageSize : 50
  const q = readParam(searchParams, 'q').trim()
  const requestedStartDate = readParam(searchParams, 'startDate').trim()
  const requestedEndDate = readParam(searchParams, 'endDate').trim()
  const requestedPreset = readParam(searchParams, 'preset').trim()
  const businessDate = await getStationCurrentBusinessDate(user.stationId)
  const dateFilter = resolveDateFilter(
    {
      startDate: requestedStartDate,
      endDate: requestedEndDate,
      preset: requestedPreset,
    },
    businessDate,
  )
  const { startDate, endDate, preset } = dateFilter

  const data = await listTransactions(user.stationId, {
    page,
    pageSize,
    scope: 'fiscalized',
    search: q || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  })

  const rows: TxnRow[] = Array.isArray(data?.items) ? data.items : []
  const total = Number(data?.total ?? rows.length)
  const totalPages = Math.ceil(total / pageSize)

  const nextPage = page + 1
  const prevPage = Math.max(1, page - 1)
  const [decimals, stationCountry] = await Promise.all([getStationDecimalSettings(user.stationId), getStationCountryCode(user.stationId)])

  const mapped: ManagerFiscalizedRow[] = rows.map((t) => ({
    id: String((t as any)?.id ?? ''),
    fiscalizedAt:
      (t as any)?.fiscalized_at ?? (t as any)?.transaction_date_time ?? null,
    receiptNumber: (t as any)?.receipt_number ?? null,
    pumpNumber: Number((t as any)?.pump_number ?? 0),
    totalAmount: Number((t as any)?.total_amount ?? 0),
    buyerName: (t as any)?.customer_buyer_name ?? null,
    tin: (t as any)?.customer_tin ?? null,
    fiscalizationReference: (t as any)?.fiscalization_reference ?? null,
    status: (t as any)?.status ?? null,
  }))

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams({
      status: 'fiscalized',
      page: String(targetPage),
      pageSize: String(pageSize),
      preset,
    })
    if (q) params.set('q', q)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    return `/transactions?${params.toString()}`
  }
  const prevHref = pageHref(prevPage)
  const nextHref = pageHref(Math.min(nextPage, Math.max(1, totalPages)))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fiscalized transactions"
        description="Fiscalized transactions for today's station business day. Use the date filter for history."
        actions={<TransactionsStatusToggle active="fiscalized" />}
      />

      <ListToolbar
        baseActionPath="/transactions?status=fiscalized"
        searchKey="q"
        searchPlaceholder="Receipt number"
        initial={{
          q,
          startDate,
          endDate,
          preset,
        }}
        currentDate={businessDate}
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm text-[var(--text-secondary)]">
          Showing page {page} - {rows.length} rows - {total} total
        </div>
      </Card>

      <FiscalizedTransactionsManagerClient
        allowCreditNotes={!isTanzaniaCountry(stationCountry)}
        rows={mapped}
        prevHref={prevHref}
        nextHref={nextHref}
        decimals={decimals}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
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
    return <AdminFiscalizedView searchParams={searchParams} />
  }

  return <ManagerFiscalizedView searchParams={searchParams} />
}
