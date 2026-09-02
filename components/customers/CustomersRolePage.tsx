import type { CustomerListResult } from '@/src/modules/customers/application/customerTypes'
import { redirect } from 'next/navigation'

import { api } from '@/src/shared/api/fetch'
import { requireAuth } from '@/src/shared/auth'
import { applyDateRangeParams } from '@/src/shared/crud/filters'

import { ListToolbar } from '@/components/crud/ListToolbar'
import CustomersPageClient, {
  CustomersAddButton,
} from '@/components/customers/CustomersPageClient'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type CustomersRole = 'tenant' | 'manager' | 'administrator'

type SearchParams = Record<string, string | string[] | undefined>

type CustomerListRow = {
  id?: string
  buyer_name?: string
  buyerName?: string
  tin?: string
  contact_email?: string
  contactEmail?: string
  contact_phone?: string
  contactPhone?: string
  city?: string
  country?: string
  last_seen_at?: string
  lastSeenAt?: string
}

const readParam = (params: SearchParams, key: string) => {
  const value = params[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

const normalizeCustomerName = (row: CustomerListRow) =>
  row.buyer_name || row.buyerName || '(No buyer name)'

const normalizeContact = (row: CustomerListRow) =>
  row.contact_email ||
  row.contactEmail ||
  row.contact_phone ||
  row.contactPhone ||
  '-'

const loadCustomers = async (opts: {
  q?: string
  startDate?: string
  endDate?: string
}) => {
  const params = new URLSearchParams()
  if (opts.q) params.set('q', opts.q)
  // Manager view expects a flat list; backend returns paged results.
  // Pull the first 200 rows to match the UI label.
  params.set('page', '1')
  params.set('pageSize', '200')
  applyDateRangeParams(params, {
    startDate: opts.startDate,
    endDate: opts.endDate,
  })

  const res = await api(`/api/customers?${params.toString()}`)
  return res
}

const loadAdminCustomers = async (params: URLSearchParams) => {
  const res = await api(`/api/customers?${params.toString()}`)
  return res
}

const TenantCustomersView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['tenant'])
  if (user.role !== 'tenant') redirect('/dashboard')

  let initialData: CustomerListResult | any = {
    rows: [],
    page: 1,
    pageSize: 20,
    total: 0,
  }
  let error: string | null = null

  try {
    const params = new URLSearchParams()
    if (searchParams.q) params.set('q', String(searchParams.q))
    if (searchParams.country)
      params.set('country', String(searchParams.country))
    if (searchParams.buyerType)
      params.set('buyerType', String(searchParams.buyerType))
    if (searchParams.includeDeleted)
      params.set('includeDeleted', String(searchParams.includeDeleted))
    if (searchParams.page) params.set('page', String(searchParams.page))
    if (searchParams.pageSize)
      params.set('pageSize', String(searchParams.pageSize))

    const payload = await loadAdminCustomers(params)
    if (!payload?.success) {
      throw new Error(payload?.error ?? 'Failed to load customers')
    }
    initialData = payload?.data ?? initialData
  } catch (err: any) {
    error = err?.message ?? 'Failed to load customers'
  }

  return (
    <CustomersPageClient
      initialData={initialData}
      error={error}
      stationCountry={user.station?.country ?? null}
    >
      <PageHeader
        title="Customers"
        description="Manage buyers and their vehicle or payment defaults before linking them to a transaction"
        actions={<CustomersAddButton />}
      />
    </CustomersPageClient>
  )
}

const ManagerCustomersView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['manager'])
  if (user.role !== 'manager') redirect('/dashboard')

  const q = readParam(searchParams, 'q').trim()
  const startDate = readParam(searchParams, 'startDate').trim()
  const endDate = readParam(searchParams, 'endDate').trim()
  const preset = readParam(searchParams, 'preset').trim()

  const customers = await loadCustomers({
    q: q || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  })

  // /api/customers returns a CustomerListResult (paged) in ApiResult.data.
  const list = customers?.success ? (customers.data as any) : null
  const rows: CustomerListRow[] = Array.isArray(list?.rows) ? list.rows : []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description="Review and monitor customers linked to your station."
      />

      <ListToolbar
        baseActionPath="/customers"
        searchKey="q"
        searchPlaceholder="Search by TIN or buyer name"
        initial={{
          q,
          startDate,
          endDate,
          preset: (preset as any) || 'last30',
        }}
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm text-[var(--text-secondary)]">
          Showing {rows.length} customers (max 200)
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Buyer name</TableHead>
              <TableHead>TIN</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row: CustomerListRow) => (
              <TableRow key={row.id ?? `${row.tin}-${row.buyer_name}`}>
                <TableCell className="font-medium text-[var(--text-primary)]">
                  {normalizeCustomerName(row)}
                  <div className="break-all text-xs text-[var(--text-muted)]">
                    {row.id}
                  </div>
                </TableCell>
                <TableCell>{row.tin || '-'}</TableCell>
                <TableCell>{normalizeContact(row)}</TableCell>
                <TableCell>{row.city || '-'}</TableCell>
                <TableCell>{row.country || '-'}</TableCell>
                <TableCell>
                  {row.last_seen_at || row.lastSeenAt || '-'}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8">
                  <EmptyState
                    title="No customers found"
                    description="Adjust filters or clear the date range to see more."
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

const AdminCustomersView = async ({
  searchParams,
}: {
  searchParams: SearchParams
}) => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  let initialData: CustomerListResult | any = {
    rows: [],
    page: 1,
    pageSize: 20,
    total: 0,
  }
  let error: string | null = null

  try {
    const params = new URLSearchParams()
    if (searchParams.q) params.set('q', String(searchParams.q))
    if (searchParams.country)
      params.set('country', String(searchParams.country))
    if (searchParams.buyerType)
      params.set('buyerType', String(searchParams.buyerType))
    if (searchParams.includeDeleted)
      params.set('includeDeleted', String(searchParams.includeDeleted))
    if (searchParams.page) params.set('page', String(searchParams.page))
    if (searchParams.pageSize)
      params.set('pageSize', String(searchParams.pageSize))

    const payload = await loadAdminCustomers(params)
    if (!payload?.success) {
      throw new Error(payload?.error ?? 'Failed to load customers')
    }
    initialData = payload?.data ?? initialData
  } catch (err: any) {
    error = err?.message ?? 'Failed to load customers'
  }

  return (
    <CustomersPageClient
      initialData={initialData}
      error={error}
      stationCountry={user.station?.country ?? null}
    >
      <PageHeader
        title="Customers"
        description="Manage buyers and their fiscalization details"
        actions={<CustomersAddButton />}
      />
    </CustomersPageClient>
  )
}

export const CustomersRolePage = async ({
  role,
  searchParams,
}: {
  role: CustomersRole
  searchParams: SearchParams
}) => {
  if (role === 'tenant') {
    return <TenantCustomersView searchParams={searchParams} />
  }

  if (role === 'manager') {
    return <ManagerCustomersView searchParams={searchParams} />
  }

  return <AdminCustomersView searchParams={searchParams} />
}
