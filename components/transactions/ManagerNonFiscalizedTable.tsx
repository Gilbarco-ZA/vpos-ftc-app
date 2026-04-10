'use client'

import type { TransactionBuilderProduct } from '@/components/transactions/TransactionProductEditor'
import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'

import { formatNumber } from '@/src/shared/utils/format'

import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { AllocateTransactionModalForm } from '@/components/transactions/allocate/AllocateTransactionModalForm'
import TransactionLinesEditorSheet from '@/components/transactions/TransactionLinesEditorSheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type TxnRow = any

const canEditItems = (status: string) =>
  ['OPEN', 'ALLOCATED', 'FAILED', 'PENDING'].includes(
    String(status || '').toUpperCase(),
  )

export function ManagerNonFiscalizedTable(props: {
  rows: TxnRow[]
  products: TransactionBuilderProduct[]
  csrfToken: string
  decimals: DecimalSettings
}) {
  const { csrfToken } = props
  const router = useRouter()

  const [tableRows, setTableRows] = useState<TxnRow[]>(props.rows || [])

  useEffect(() => {
    setTableRows(props.rows || [])
  }, [props.rows])
  const [allocateTxn, setAllocateTxn] = useState<TxnRow | null>(null)
  const [detailsTxn, setDetailsTxn] = useState<TxnRow | null>(null)
  const [editingTxn, setEditingTxn] = useState<TxnRow | null>(null)
  const formatMoney = (value: any) =>
    formatNumber(value == null ? null : Number(value), props.decimals.money)
  const formatVolume = (value: any) =>
    formatNumber(value == null ? null : Number(value), props.decimals.volume)

  const hasRows = tableRows && tableRows.length > 0

  const mapped = useMemo(() => {
    return (tableRows || []).map((t) => {
      const dt = t.transaction_date_time ? String(t.transaction_date_time) : ''
      const customerName = t.customer_trade_name || t.customer_id || ''
      const customerTin = t.customer_tin || ''
      const unassigned = !customerName && !customerTin
      return {
        ...t,
        _dt: dt,
        _customerName: customerName,
        _customerTin: customerTin,
        _unassigned: unassigned,
      }
    })
  }, [tableRows])

  const submitFiscalize = (transactionId: string) => {
    const form = document.getElementById(
      `fiscalize-${transactionId}`,
    ) as HTMLFormElement | null
    form?.requestSubmit()
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date/Time</TableHead>
            <TableHead>Pump</TableHead>
            <TableHead>POS Ref</TableHead>
            <TableHead>Fuel</TableHead>
            <TableHead>Volume</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mapped.map((t) => {
            const normalizedStatus = String(t.status || '').toUpperCase()
            const canQueue = ['ALLOCATED', 'OPEN', 'FAILED'].includes(
              normalizedStatus,
            )
            return (
              <TableRow key={t.id} className="align-top">
                <TableCell className="whitespace-nowrap">
                  <div className="text-xs text-[var(--text-secondary)]">
                    {t._dt}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto px-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    onClick={() => setDetailsTxn(t)}
                    title="View details"
                  >
                    {t.id}
                  </Button>
                </TableCell>
                <TableCell>{t.pump_number ?? ''}</TableCell>
                <TableCell>{t.pos_reference ?? '-'}</TableCell>
                <TableCell>{t.fuel_type ?? '-'}</TableCell>
                <TableCell>
                  {t.volume != null ? formatVolume(t.volume) : '-'}
                </TableCell>
                <TableCell>{formatMoney(t.total_amount)}</TableCell>
                <TableCell>
                  <div>{t.status}</div>
                  {t.retry_count ? (
                    <div className="text-xs text-[var(--text-muted)]">
                      Retries: {t.retry_count}
                    </div>
                  ) : null}
                  {t.last_error ? (
                    <div
                      className="mt-1 max-w-xs truncate text-xs text-red-600"
                      title={String(t.last_error)}
                    >
                      {String(t.last_error)}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  {t._unassigned ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      onClick={() => setAllocateTxn(t)}
                      title="Click to allocate a customer"
                    >
                      Unassigned - click to allocate
                    </Button>
                  ) : (
                    <div>
                      <div>{t._customerName || '-'}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {t._customerTin || ''}
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <form
                    id={`fiscalize-${t.id}`}
                    method="post"
                    action="/api/transactions/fiscalize"
                    className="hidden"
                  >
                    <CsrfHiddenInput token={csrfToken} />
                    <input type="hidden" name="transactionId" value={t.id} />
                  </form>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        ⋯
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEditItems(t.status) ? (
                        <DropdownMenuItem onSelect={() => setEditingTxn(t)}>
                          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                          Edit items
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        disabled={!canQueue}
                        onSelect={(event) => {
                          if (!canQueue) {
                            event.preventDefault()
                            return
                          }
                          submitFiscalize(String(t.id))
                        }}
                      >
                        Send to fiscalization
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          router.push(
                            `/transactions?status=fiscalized&view=receipt&transactionId=${encodeURIComponent(
                              t.id,
                            )}`,
                          )
                        }
                      >
                        View receipt
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setAllocateTxn(t)}>
                        Link customer
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDetailsTxn(t)}>
                        Details
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}

          {!hasRows && (
            <TableRow>
              <TableCell
                colSpan={9}
                className="py-6 text-center text-[var(--text-muted)]"
              >
                No transactions found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog
        open={!!allocateTxn}
        onOpenChange={(open) => !open && setAllocateTxn(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {allocateTxn
                ? `Allocate customer - ${String(allocateTxn?.id).slice(0, 8)}...`
                : 'Allocate customer'}
            </DialogTitle>
          </DialogHeader>

          {allocateTxn ? (
            <div className="space-y-3">
              <Card className="bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
                <div>
                  <span className="font-medium">Transaction:</span>{' '}
                  {allocateTxn.id}
                </div>
                <div>
                  <span className="font-medium">Pump:</span>{' '}
                  {allocateTxn.pump_number ?? '-'}
                </div>
                <div>
                  <span className="font-medium">Amount:</span>{' '}
                  {formatMoney(allocateTxn.total_amount)}
                </div>
                {allocateTxn.pos_reference ? (
                  <div>
                    <span className="font-medium">POS ref:</span>{' '}
                    {allocateTxn.pos_reference}
                  </div>
                ) : null}
              </Card>

              <AllocateTransactionModalForm
                transactionId={allocateTxn.id}
                initialQuery={
                  allocateTxn.customer_tin ||
                  allocateTxn.customer_trade_name ||
                  ''
                }
                onSuccess={() => {
                  setAllocateTxn(null)
                  router.refresh()
                }}
              />
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detailsTxn}
        onOpenChange={(open) => !open && setDetailsTxn(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detailsTxn
                ? `Transaction details - ${String(detailsTxn?.id).slice(0, 8)}...`
                : 'Transaction details'}
            </DialogTitle>
          </DialogHeader>

          {detailsTxn ? (
            <pre className="max-h-[60vh] overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
              {JSON.stringify(detailsTxn, null, 2)}
            </pre>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionLinesEditorSheet
        open={Boolean(editingTxn)}
        transactionId={editingTxn?.id ?? null}
        products={props.products}
        decimals={props.decimals}
        csrfToken={csrfToken}
        onClose={() => setEditingTxn(null)}
        showToast={() => {}}
        onSaved={(result) => {
          const transactionId = String(
            result?.transactionId ?? editingTxn?.id ?? '',
          )
          setTableRows((current) =>
            current.map((row) =>
              String(row?.id) === transactionId
                ? {
                    ...row,
                    total_amount: Number(
                      result?.totalAmount ?? row.total_amount ?? 0,
                    ),
                    fuel_type:
                      Number(result?.lineCount ?? 0) > 1
                        ? 'Mixed sale'
                        : row?.fuel_type,
                    volume:
                      Number(result?.lineCount ?? 0) > 1 ? null : row?.volume,
                  }
                : row,
            ),
          )
          setEditingTxn(null)
        }}
      />
    </>
  )
}
