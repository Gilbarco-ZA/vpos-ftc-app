'use client'

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

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DetailItem, DetailList } from '@/components/ui/detail-list'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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

export type FiscalInboxRow = {
  id: number
  stationId: string
  topic: string
  status: string
  requestId: string | null
  attemptCount: number
  nextAttemptAt: string | null
  createdAt: string | null
  processedAt: string | null
  deadAt: string | null
  errorText: string | null
  relatedTransactionId: string | null
  relatedTransactionStatus: string | null
}

type FiscalInboxPageClientProps = {
  initialRows: FiscalInboxRow[]
  error?: string | null
  children: ReactNode
}

type FiscalInboxUIContextValue = {
  refresh: () => void
  showToast: (variant: ToastVariant, message: string) => void
}

const FiscalInboxUIContext = createContext<FiscalInboxUIContextValue | null>(
  null,
)

const useFiscalInboxUI = () => {
  const ctx = useContext(FiscalInboxUIContext)
  if (!ctx) throw new Error('Fiscal inbox UI context not available')
  return ctx
}

export const FiscalInboxRefreshButton = () => {
  const { refresh } = useFiscalInboxUI()
  return (
    <Button variant="secondary" onClick={refresh}>
      Refresh
    </Button>
  )
}

const statusOptions = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Processed', value: 'PROCESSED' },
]

const normalizeRow = (row: any): FiscalInboxRow => ({
  id: Number(row?.id ?? 0),
  stationId: String(row?.station_id ?? row?.stationId ?? ''),
  topic: String(row?.topic ?? ''),
  status: String(row?.status ?? ''),
  requestId: row?.request_id ?? row?.requestId ?? null,
  attemptCount: Number(row?.attempt_count ?? row?.attemptCount ?? 0),
  nextAttemptAt: row?.next_attempt_at ?? row?.nextAttemptAt ?? null,
  createdAt:
    row?.created_at ??
    row?.createdAt ??
    row?.received_at ??
    row?.receivedAt ??
    null,
  processedAt: row?.processed_at ?? row?.processedAt ?? null,
  deadAt: row?.dead_at ?? row?.deadAt ?? null,
  errorText: row?.error_text ?? row?.errorText ?? null,
  relatedTransactionId:
    row?.related_transaction_id ?? row?.relatedTransactionId ?? null,
  relatedTransactionStatus:
    row?.related_transaction_status ?? row?.relatedTransactionStatus ?? null,
})

const formatDate = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const statusVariant = (status: string) => {
  const normalized = status.toUpperCase()
  if (normalized === 'PROCESSED') return STATUS_VARIANT.SUCCESS
  if (normalized === 'FAILED' || normalized === 'DEAD')
    return STATUS_VARIANT.ERROR
  if (normalized === 'PENDING') return STATUS_VARIANT.WARN
  return STATUS_VARIANT.INFO
}

const statusLabel = (status: string) => {
  const normalized = status.toUpperCase()
  if (normalized === 'PROCESSED') return 'Processed'
  if (normalized === 'FAILED') return 'Failed'
  if (normalized === 'DEAD') return 'Dead'
  if (normalized === 'PENDING') return 'Pending'
  if (normalized === 'PROCESSING') return 'Processing'
  return status || 'Unknown'
}

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value ?? '')
  }
}

const truncate = (value: string, max = 2400) =>
  value.length > max ? `${value.slice(0, max)}...` : value

const FiltersRow = ({
  search,
  status,
  startDate,
  endDate,
  onSearchChange,
  onStatusChange,
  onStartDateChange,
  onEndDateChange,
  onRefresh,
}: {
  search: string
  status: string
  startDate: string
  endDate: string
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onRefresh: () => void
}) => (
  <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface-card px-4 py-3">
    <div className="min-w-[220px] flex-1">
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search by reference or message id"
      />
    </div>
    <div className="w-44">
      <Select
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={startDate}
        onChange={(event) => onStartDateChange(event.target.value)}
      />
      <span className="text-xs text-[var(--text-muted)]">to</span>
      <Input
        type="date"
        value={endDate}
        onChange={(event) => onEndDateChange(event.target.value)}
      />
    </div>
    <Button variant="secondary" onClick={onRefresh}>
      Refresh
    </Button>
  </div>
)

const FiscalInboxPageClient = ({
  initialRows,
  error,
  children,
}: FiscalInboxPageClientProps) => {
  const [rows, setRows] = useState<FiscalInboxRow[]>(initialRows)
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [detailsRow, setDetailsRow] = useState<FiscalInboxRow | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [err, setErr] = useState<string | null>(error ?? null)

  const showToast = (variant: ToastVariant, message: string) => {
    setToast({ id: `${Date.now()}`, variant, message })
  }

  const refresh = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const sp = new URLSearchParams()
      if (filter.trim()) sp.set('q', filter.trim())
      if (status !== 'ALL') sp.set('status', status)
      if (startDate) sp.set('startDate', startDate)
      if (endDate) sp.set('endDate', endDate)
      const res = await fetch(`/api/runtime/fiscal/inbox?${sp.toString()}`)
      if (!res.ok) {
        throw new Error(await res.text())
      }
      const payload = await res.json()
      const items = Array.isArray(payload?.data?.items)
        ? payload.data.items
        : Array.isArray(payload?.items)
          ? payload.items
          : []
      setRows(items.map(normalizeRow))
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load fiscal inbox')
    } finally {
      setBusy(false)
    }
  }, [endDate, filter, startDate, status])

  useEffect(() => {
    void refresh()
    // Initial API hydration only. Filter changes remain explicit via Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    if (!filter) return rows
    const needle = filter.toLowerCase()
    return rows.filter((r) => {
      const requestId = r.requestId ?? ''
      return (
        requestId.toLowerCase().includes(needle) ||
        String(r.id).includes(needle)
      )
    })
  }, [rows, filter])

  const renderDetails = () => {
    if (!detailsRow) return null
    return (
      <Sheet open={!!detailsRow} onOpenChange={() => setDetailsRow(null)}>
        <SheetContent className="max-w-[520px] sm:max-w-[520px]">
          <SheetHeader>
            <SheetTitle>Fiscal Inbox Row</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3 text-sm">
            <DetailList columns={2}>
              <DetailItem label="ID">{detailsRow.id}</DetailItem>
              <DetailItem label="Inbox status">
                <Badge variant={statusVariant(detailsRow.status)}>
                  {statusLabel(detailsRow.status)}
                </Badge>
              </DetailItem>
              <DetailItem label="Related transaction status">
                {detailsRow.relatedTransactionStatus ? (
                  <Badge
                    variant={statusVariant(detailsRow.relatedTransactionStatus)}
                  >
                    {statusLabel(detailsRow.relatedTransactionStatus)}
                  </Badge>
                ) : (
                  '—'
                )}
              </DetailItem>
              <DetailItem label="Topic">{detailsRow.topic}</DetailItem>
              <DetailItem label="Attempts">
                {detailsRow.attemptCount}
              </DetailItem>
              <DetailItem label="Request ID">
                <span className="font-mono text-xs">
                  {detailsRow.requestId ?? '—'}
                </span>
              </DetailItem>
              <DetailItem label="Related transaction ID">
                <span className="font-mono text-xs">
                  {detailsRow.relatedTransactionId ?? '—'}
                </span>
              </DetailItem>
              <DetailItem label="Created">
                {formatDate(detailsRow.createdAt)}
              </DetailItem>
              <DetailItem label="Processed">
                {formatDate(detailsRow.processedAt)}
              </DetailItem>
              <DetailItem label="Next Attempt">
                {formatDate(detailsRow.nextAttemptAt)}
              </DetailItem>
              <DetailItem label="Dead At">
                {formatDate(detailsRow.deadAt)}
              </DetailItem>
            </DetailList>

            {detailsRow.errorText && (
              <Alert variant={STATUS_VARIANT.ERROR}>
                {detailsRow.errorText}
              </Alert>
            )}

            <div>
              <div className="text-xs font-medium text-[var(--text-muted)]">
                Message JSON
              </div>
              <pre className="mt-2 max-h-[280px] overflow-auto rounded-card bg-surface-muted p-3 text-xs">
                {truncate(safeStringify(detailsRow), 2400)}
              </pre>
            </div>
          </div>

          <SheetFooter className="mt-4">
            <Button variant="secondary" onClick={() => setDetailsRow(null)}>
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <FiscalInboxUIContext.Provider value={{ refresh, showToast }}>
      <div className="space-y-4">
        {children}

        {err && <ErrorDetails title="ERROR" message={err} error={err} />}

        <Card className="p-4">
          <FiltersRow
            search={filter}
            status={status}
            startDate={startDate}
            endDate={endDate}
            onSearchChange={setFilter}
            onStatusChange={setStatus}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onRefresh={refresh}
          />
        </Card>

        {busy ? (
          <TableSkeleton
            rows={6}
            columns={8}
            showHeader={false}
            showFilters={false}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No fiscal inbox rows"
            description="No rows match the selected filters."
          />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Inbox status</TableHead>
                  <TableHead>Related txn</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Next</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.id}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>
                        {statusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.relatedTransactionStatus ? (
                        <div className="space-y-1">
                          <Badge
                            variant={statusVariant(
                              row.relatedTransactionStatus,
                            )}
                          >
                            {statusLabel(row.relatedTransactionStatus)}
                          </Badge>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          {row.relatedTransactionId ?? '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{row.topic}</TableCell>
                    <TableCell>{row.attemptCount}</TableCell>
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                    <TableCell>{formatDate(row.nextAttemptAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="secondary" size="sm">
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailsRow(row)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              (window.location.href = `/transaction/fiscal-inbox/${row.id}`)
                            }
                          >
                            Open row
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {renderDetails()}

        {toast && (
          <ToastViewport>
            <ToastItem variant={toast.variant}>{toast.message}</ToastItem>
          </ToastViewport>
        )}
      </div>
    </FiscalInboxUIContext.Provider>
  )
}

export default FiscalInboxPageClient
