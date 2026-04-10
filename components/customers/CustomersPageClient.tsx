'use client'

import type {
  CustomerListResult,
  CustomerSummary,
} from '@/src/shared/server/customersTypes'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { safeCopy } from '@/src/shared/utils/clipboard'
import { formatDate } from '@/src/shared/utils/dates'

import CustomerDetailsDrawer, {
  CustomerDetails,
} from '@/components/customers/CustomerDetailsDrawer'
import CustomerDrawer, {
  CustomerFormData,
} from '@/components/customers/CustomerDrawer'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import {
  ToastItem,
  ToastMessage,
  ToastVariant,
  ToastViewport,
} from '@/components/ui/toast'

export type CustomersPageClientProps = {
  initialData: CustomerListResult
  error?: string | null
  children: ReactNode
  stationCountry?: string | null
}

type CustomersUIContextValue = {
  openAdd: () => void
}

const CustomersUIContext = createContext<CustomersUIContextValue | null>(null)

export const useCustomersUI = () => {
  const context = useContext(CustomersUIContext)
  if (!context) throw new Error('Customers UI context not available')
  return context
}

export const CustomersAddButton = () => {
  const { openAdd } = useCustomersUI()
  return (
    <Button variant="primary" onClick={openAdd}>
      Add customer
    </Button>
  )
}

const formatContact = (customer: CustomerSummary) => {
  return (
    customer.contactEmail ||
    customer.contactPhone ||
    customer.contactMobile ||
    '—'
  )
}

const mapSummaryToForm = (summary: CustomerSummary): CustomerFormData => ({
  id: summary.id,
  buyerName: summary.buyerName,
  tin: summary.tin,
  buyerType: summary.buyerType ?? '',
  contactEmail: summary.contactEmail ?? '',
  contactPhone: summary.contactPhone ?? '',
  contactMobile: summary.contactMobile ?? '',
  country: summary.country ?? '',
  odometer: summary.odometer ?? '',
  vehicleRegNr: summary.vehicleRegNr ?? '',
  paymentType: (summary.paymentType as 'CASH' | 'CARD' | undefined) ?? 'CASH',
})

const normalizeSearch = (value: string) => value.trim()

const CustomersPageClient = ({
  initialData,
  error,
  children,
  stationCountry,
}: CustomersPageClientProps) => {
  const [rows, setRows] = useState<CustomerSummary[]>(initialData?.rows ?? [])
  const [page, setPage] = useState(initialData?.page ?? 1)
  const [pageSize] = useState(initialData?.pageSize ?? 20)
  const [total, setTotal] = useState(initialData?.total ?? 0)
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [buyerType, setBuyerType] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(error || null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [editCustomer, setEditCustomer] = useState<CustomerFormData | null>(
    null,
  )

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsCustomer, setDetailsCustomer] =
    useState<CustomerDetails | null>(null)

  const [csrfToken, setCsrfToken] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = (variant: ToastVariant, message: string) => {
    setToasts((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, variant, message },
    ])
  }

  const fetchCustomers = useCallback(
    async (opts?: { page?: number }) => {
      setLoading(true)
      setLoadError(null)
      const params = new URLSearchParams()
      const q = normalizeSearch(search)
      if (q) params.set('q', q)
      if (country) params.set('country', country)
      if (buyerType) params.set('buyerType', buyerType)
      if (includeDeleted) params.set('includeDeleted', 'true')
      params.set('page', String(opts?.page ?? page))
      params.set('pageSize', String(pageSize))

      try {
        const res = await fetch(`/api/customers?${params.toString()}`, {
          cache: 'no-store',
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data?.ok === false) {
          setLoadError(res.ok ? data : { status: res.status, body: data })
          return
        }
        const payload = data?.data ?? data
        setRows(payload.rows || [])
        setPage(payload.page || 1)
        setTotal(payload.total || 0)
      } catch (err) {
        setLoadError(err)
      } finally {
        setLoading(false)
      }
    },
    [search, country, buyerType, includeDeleted, page, pageSize],
  )

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchCustomers({ page: 1 })
    }, 300)
    return () => window.clearTimeout(id)
  }, [search, country, buyerType, includeDeleted, fetchCustomers])

  const openAdd = () => {
    setDrawerMode('create')
    setEditCustomer(null)
    setDrawerOpen(true)
  }

  const openEdit = (customer: CustomerSummary) => {
    setDrawerMode('edit')
    setEditCustomer(mapSummaryToForm(customer))
    setDrawerOpen(true)
  }

  const openDetails = async (customer: CustomerSummary) => {
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        showToast('error', 'Unable to load customer details')
        return
      }
      setDetailsCustomer(data?.data ?? data)
      setDetailsOpen(true)
    } catch {
      showToast('error', 'Unable to load customer details')
    }
  }

  const handleSaved = () => {
    fetchCustomers()
    showToast(
      'success',
      drawerMode === 'create' ? 'Customer created' : 'Customer updated',
    )
  }

  const handleDelete = async (customer: CustomerSummary, restore = false) => {
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ csrf_token: csrfToken, restore }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        showToast('error', data?.error?.message || 'Unable to update customer')
        return
      }
      showToast('success', restore ? 'Customer restored' : 'Customer deleted')
      fetchCustomers()
    } catch {
      showToast('error', 'Unable to update customer')
    }
  }

  const copyTin = async (value: string) => {
    const ok = await safeCopy(value)
    if (ok) {
      showToast('success', 'TIN copied')
      return
    }
    showToast('error', 'Unable to copy TIN')
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const tableRows = useMemo(() => rows, [rows])

  return (
    <CustomersUIContext.Provider value={{ openAdd }}>
      <CsrfBootstrap onToken={setCsrfToken} />
      <div className="space-y-4">
        {children}

        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_160px_200px_160px]">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by buyer, TIN, email, or phone"
              className="w-full"
            />
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="Country"
              className="w-full"
            />
            <Select
              value={buyerType}
              onChange={(e) => setBuyerType(e.target.value)}
              className="w-full"
            >
              <option value="">Buyer type</option>
              <option value="B2C">B2C</option>
              <option value="B2B">B2B</option>
              <option value="GOV">Government</option>
              <option value="OTHER">Other</option>
            </Select>
            <Select
              value={includeDeleted ? 'all' : 'active'}
              onChange={(e) => setIncludeDeleted(e.target.value === 'all')}
              className="w-full"
            >
              <option value="active">Active only</option>
              <option value="all">Show deleted</option>
            </Select>
          </div>
        </Card>

        {/* {loadError && (
          <ErrorDetails
            title="Unable to load customers"
            message="Check the filter settings and try again."
            error={loadError}
          />
        )} */}

        <div className="relative">
          {loading && tableRows.length > 0 ? (
            <LoadingOverlay label="Loading customers…" />
          ) : null}

          {loading && tableRows.length === 0 ? (
            <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2">
              <div className="p-4">
                <TableSkeleton
                  rows={8}
                  columns={7}
                  showHeader={false}
                  showFilters={false}
                />
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buyer name</TableHead>
                    <TableHead>TIN</TableHead>
                    <TableHead>Buyer type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && tableRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-sm text-[var(--text-muted)]"
                      >
                        Loading customers…
                      </TableCell>
                    </TableRow>
                  )}

                  {!loading && tableRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8">
                        <EmptyState
                          title="No customers yet"
                          description="Add a customer or adjust filters to get started."
                          action={
                            <Button variant="primary" onClick={openAdd}>
                              Add customer
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}

                  {tableRows.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium text-[var(--text-primary)]">
                        {customer.buyerName}
                        {customer.deletedAt && (
                          <Badge variant={STATUS_VARIANT.WARN} className="ml-2">
                            Deleted
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{customer.tin || '—'}</TableCell>
                      <TableCell>{customer.buyerType || '—'}</TableCell>
                      <TableCell>{formatContact(customer)}</TableCell>
                      <TableCell>{customer.country || '—'}</TableCell>
                      <TableCell>
                        <div className="text-sm text-[var(--text-primary)]">
                          {customer.vehicleRegNr || '—'}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {customer.paymentType || '—'} • Odo:{' '}
                          {customer.odometer || '—'}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(customer.lastSeenAt)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              •••
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => openDetails(customer)}
                            >
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => openEdit(customer)}
                            >
                              Edit
                            </DropdownMenuItem>
                            {customer.tin && (
                              <DropdownMenuItem
                                onClick={() =>
                                  void copyTin(String(customer.tin))
                                }
                              >
                                Copy TIN
                              </DropdownMenuItem>
                            )}
                            {!customer.deletedAt ? (
                              <DropdownMenuItem
                                onSelect={() => handleDelete(customer, false)}
                              >
                                Delete
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => handleDelete(customer, true)}
                              >
                                Restore
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-[var(--text-muted)]">
            Page {page} of {totalPages} • {total} total
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchCustomers({ page: Math.max(1, page - 1) })}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                fetchCustomers({ page: Math.min(totalPages, page + 1) })
              }
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <CustomerDrawer
        open={drawerOpen}
        mode={drawerMode}
        customer={editCustomer}
        stationCountry={stationCountry}
        onOpenChange={setDrawerOpen}
        onSaved={handleSaved}
      />

      <CustomerDetailsDrawer
        open={detailsOpen}
        customer={detailsCustomer}
        onOpenChange={setDetailsOpen}
        onEdit={() => {
          if (detailsCustomer) {
            setDetailsOpen(false)
            setDrawerMode('edit')
            setEditCustomer({
              id: detailsCustomer.id,
              buyerName: detailsCustomer.buyerName,
              tin: detailsCustomer.tin,
              buyerType: detailsCustomer.buyerType ?? '',
              pin: detailsCustomer.pin ?? '',
              passportNumber: detailsCustomer.passportNumber ?? '',
              businessName: detailsCustomer.businessName ?? '',
              taxNinbrn: detailsCustomer.taxNinbrn ?? '',
              contactPerson: detailsCustomer.contactPerson ?? '',
              contactPhone: detailsCustomer.contactPhone ?? '',
              contactMobile: detailsCustomer.contactMobile ?? '',
              contactFax: detailsCustomer.contactFax ?? '',
              contactEmail: detailsCustomer.contactEmail ?? '',
              contactWebsite: detailsCustomer.contactWebsite ?? '',
              addressStreet: detailsCustomer.addressStreet ?? '',
              addressCity: detailsCustomer.addressCity ?? '',
              addressState: detailsCustomer.addressState ?? '',
              addressProvince: detailsCustomer.addressProvince ?? '',
              addressPostalCode: detailsCustomer.addressPostalCode ?? '',
              addressCountryCode: detailsCustomer.addressCountryCode ?? '',
              country: detailsCustomer.country ?? '',
              odometer: detailsCustomer.odometer ?? '',
              vehicleRegNr: detailsCustomer.vehicleRegNr ?? '',
              paymentType:
                (detailsCustomer.paymentType as 'CASH' | 'CARD' | undefined) ??
                'CASH',
            })
            setDrawerOpen(true)
          }
        }}
      />

      <ToastViewport>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            variant={toast.variant}
            onDismiss={() =>
              setToasts((prev) => prev.filter((item) => item.id !== toast.id))
            }
          >
            {toast.message}
          </ToastItem>
        ))}
      </ToastViewport>
    </CustomersUIContext.Provider>
  )
}

export default CustomersPageClient
