import Link from 'next/link'
import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'
import { applyDateRangeParams } from '@/src/shared/crud/filters'
import { getCsrfToken } from '@/src/shared/security/csrf'
import { getStationDecimalSettings } from '@/src/shared/server/decimalSettings'

import { listTransactionCatalogProducts } from '@/src/modules/transactions/application/queries/list-transaction-catalog-products'
import { listTransactions } from '@/src/modules/transactions/application/queries/list-transactions'

import { ListToolbar } from '@/components/crud/ListToolbar'
import { PageHeader } from '@/components/layout/page-header'
import { ManagerNonFiscalizedTable } from '@/components/transactions/ManagerNonFiscalizedTable'
import NonFiscalizedTransactionsPageClient, {
  NonFiscalizedTransactionsRefreshButton,
  TransactionListItem,
} from '@/components/transactions/NonFiscalizedTransactionsPageClient'
import TenantTransactionsClient from '@/components/transactions/TenantTransactionsClient'
import { TransactionsStatusToggle } from '@/components/transactions/TransactionsStatusToggle'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export type NonFiscalizedRole = 'tenant' | 'manager' | 'administrator'

type SearchParams = Record<string, string | string[] | undefined>

type TxnRow = any

const readParam = (params: SearchParams, key: string) => {
  const value = params[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

const loadManagerTransactions = async (
  stationId: string,
  opts: {
    page?: number
    pageSize?: number
    pumpNumber?: string
    excludeStatus?: string
    transactionId?: string
    search?: string
    startDate?: string
    endDate?: string
  },
) => {
  const params = new URLSearchParams()
  applyDateRangeParams(params, {
    startDate: opts.startDate,
    endDate: opts.endDate,
  })

  const rows = await listTransactions(stationId, {
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 50,
    excludeStatus: opts.excludeStatus || 'FISCALIZED',
    transactionId: opts.transactionId || undefined,
    pumpNumber: opts.pumpNumber ? Number(opts.pumpNumber) : undefined,
    search: opts.search || undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
  })

  return {
    items: Array.isArray(rows?.items) ? rows.items : [],
    total: Number(rows?.total ?? 0),
    page: Number(rows?.page ?? opts.page ?? 1),
    pageSize: Number(rows?.pageSize ?? opts.pageSize ?? 50),
  }
}

const loadTenantTransactions = async (stationId: string, pump?: string) => {
  const rows = await listTransactions(stationId, {
    limit: 200,
    excludeStatus: 'FISCALIZED',
    pumpNumber: pump ? Number(pump) : undefined,
  })

  return {
    data: Array.isArray(rows?.items) ? rows.items : [],
  }
}

const normalizeAdminRows = (items: any[]): TransactionListItem[] => {
  return items.map((item: any) => ({
    id: String(item?.id ?? ''),
    transactionDateTime:
      item?.transaction_date_time ?? item?.transactionDateTime ?? null,
    posReference: item?.pos_reference ?? item?.posReference ?? null,
    pumpNumber: Number(item?.pump_number ?? item?.pumpNumber ?? 0),
    fuelType: item?.fuel_type ?? item?.fuelType ?? null,
    volume: item?.volume ?? null,
    totalAmount: Number(item?.total_amount ?? item?.totalAmount ?? 0),
    status: String(item?.status ?? ''),
    retryCount: Number(item?.retry_count ?? item?.retryCount ?? 0),
    fiscalQueueEnqueuedAt:
      item?.fiscal_queue_enqueued_at ?? item?.fiscalQueueEnqueuedAt ?? null,
    lastError: item?.last_error ?? item?.lastError ?? null,
  }))
}

const AdminNonFiscalizedView = async () => {
  const user = await requireAuth(['manager', 'administrator'])
  if (!['administrator', 'manager'].includes(user.role)) redirect('/dashboard')

  let rows: TransactionListItem[] = []
  let error: string | null = null
  const [decimals, products] = await Promise.all([
    getStationDecimalSettings(user.stationId),
    listTransactionCatalogProducts(user.stationId),
  ])

  try {
    const list = await listTransactions(user.stationId, {
      scope: 'non-fiscalized',
      limit: 200,
    })
    rows = normalizeAdminRows(Array.isArray(list?.items) ? list.items : [])
  } catch (err: any) {
    error = err?.message ?? 'Failed to load transactions'
  }

  return (
    <NonFiscalizedTransactionsPageClient
      initialTransactions={rows}
      products={products.map((product) => ({
        id: String(product.id),
        externalProductId: product.externalProductId,
        productCode: product.productCode,
        productName: product.productName,
        unitPrice: Number(product.unitPrice ?? 0),
        currency: product.currency,
        unitOfMeasure: product.unitOfMeasure,
      }))}
      error={error}
      decimals={decimals}
      stationCountry={user.station?.country ?? null}
    >
      <PageHeader
        title="Non-fiscalized transactions"
        description="All transactions that are not in FISCALIZED status."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="primary">
              <Link href="/pos">Open POS</Link>
            </Button>
            <TransactionsStatusToggle active="non-fiscalized" />
            <NonFiscalizedTransactionsRefreshButton />
          </div>
        }
      />
    </NonFiscalizedTransactionsPageClient>
  )
}

const ManagerNonFiscalizedView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['manager', 'administrator'])
  if (user.role !== 'manager' && user.role !== 'administrator')
    redirect('/dashboard')

  const page = Number(readParam(searchParams, 'page') || '1') || 1
  const pump = readParam(searchParams, 'pump').trim()
  const transactionId = readParam(searchParams, 'transactionId').trim()
  const q = readParam(searchParams, 'q').trim()
  const startDate = readParam(searchParams, 'startDate').trim()
  const endDate = readParam(searchParams, 'endDate').trim()
  const preset = readParam(searchParams, 'preset').trim()

  const data = await loadManagerTransactions(user.stationId, {
    page,
    pageSize: 50,
    pumpNumber: pump || undefined,
    excludeStatus: 'FISCALIZED',
    transactionId: transactionId || undefined,
    search: q || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  })

  const rows: TxnRow[] = data.items || data || []
  const total = data.total ?? rows.length

  const [csrfToken, decimals, products] = await Promise.all([
    getCsrfToken(),
    getStationDecimalSettings(user.stationId),
    listTransactionCatalogProducts(user.stationId),
  ])

  const nextPage = page + 1
  const prevPage = Math.max(1, page - 1)

  const mk = (p: number) => {
    const sp = new URLSearchParams()
    sp.set('status', 'non-fiscalized')
    sp.set('page', String(p))
    if (pump) sp.set('pump', pump)
    if (transactionId) sp.set('transactionId', transactionId)
    if (q) sp.set('q', q)
    if (startDate) sp.set('startDate', startDate)
    if (endDate) sp.set('endDate', endDate)
    if (preset) sp.set('preset', preset)
    return `/transactions?${sp.toString()}`
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Non-fiscalized transactions"
        description="All transactions that are not in FISCALIZED status."
        actions={
          <>
            <Button asChild variant="primary">
              <Link href="/pos">Open POS</Link>
            </Button>
            <TransactionsStatusToggle active="non-fiscalized" />
          </>
        }
      />

      <ListToolbar
        baseActionPath="/transactions?status=non-fiscalized"
        searchKey="q"
        searchPlaceholder="Search: ID / POS ref / fiscal ref / customer / pump"
        initial={{
          q,
          startDate,
          endDate,
          preset: (preset as any) || 'last7',
        }}
        facets={[
          {
            key: 'pump',
            label: 'Pump',
            options: Array.from({ length: 32 }).map((_, i) => ({
              label: String(i + 1),
              value: String(i + 1),
            })),
            value: pump,
          },
        ]}
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm text-[var(--text-secondary)]">
          Showing page {page} - {rows.length} rows - {total} total
        </div>

        <ManagerNonFiscalizedTable
          rows={rows}
          products={products.map((product) => ({
            id: String(product.id),
            externalProductId: product.externalProductId,
            productCode: product.productCode,
            productName: product.productName,
            unitPrice: Number(product.unitPrice ?? 0),
            currency: product.currency,
            unitOfMeasure: product.unitOfMeasure,
          }))}
          csrfToken={csrfToken}
          decimals={decimals}
        />

        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <Button asChild variant="secondary" size="sm">
            <Link href={mk(prevPage)}>Previous</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={mk(nextPage)}>Next</Link>
          </Button>
        </div>
      </Card>

      <Card className="p-4 text-xs text-[var(--text-secondary)]">
        <div className="font-medium text-[var(--text-primary)]">Notes</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Customer + TIN are pulled from the linked customer record (if
            allocated).
          </li>
          <li>
            Queueing uses{' '}
            <code className="rounded bg-[var(--surface-hover)] px-1">
              POST /api/transactions/fiscalize
            </code>
            .
          </li>
        </ul>
      </Card>
    </div>
  )
}

const TenantNonFiscalizedView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['tenant'])
  if (user.role !== 'tenant') redirect('/dashboard')

  const pump = readParam(searchParams, 'pump').trim()
  const txns = await loadTenantTransactions(user.stationId, pump || undefined)
  const decimals = await getStationDecimalSettings(user.stationId)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transactions"
        description="Allocate a customer before fiscalization or send without a customer when needed."
        actions={
          <Button asChild variant="primary">
            <Link href="/pos">Open POS</Link>
          </Button>
        }
      />

      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          Select pump
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          method="get"
          action="/transactions"
        >
          <Input
            name="pump"
            defaultValue={pump}
            placeholder="Pump number (e.g., 1)"
            className="w-48"
          />
          <Button type="submit" variant="primary">
            Load open transactions
          </Button>
        </form>
        <p className="text-sm text-[var(--text-secondary)]">
          Allocate a customer to a transaction before it is sent to the cloud.
          If the linking window expires, the transaction is sent automatically
          without a customer.
        </p>
      </Card>

      <TenantTransactionsClient
        initial={txns?.data || txns || []}
        decimals={decimals}
      />
    </div>
  )
}

export const NonFiscalizedTransactionsRolePage = async ({
  role,
  searchParams,
}: {
  role: NonFiscalizedRole
  searchParams: SearchParams
}) => {
  if (role === 'tenant') {
    return <TenantNonFiscalizedView searchParams={searchParams} />
  }

  if (role === 'administrator') {
    return <AdminNonFiscalizedView />
  }

  return <ManagerNonFiscalizedView searchParams={searchParams} />
}
