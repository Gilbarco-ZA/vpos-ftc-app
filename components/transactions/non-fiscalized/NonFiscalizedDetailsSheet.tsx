import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import type { TransactionListItem } from '@/src/shared/types/transactions'
import { Ban, Copy, FileText, RotateCcw, Send, UserRound } from 'lucide-react'

import { formatDate } from '@/src/shared/utils/dates'
import { formatNumber } from '@/src/shared/utils/format'

import { requiresCustomerForFiscalizationRetry } from '@/src/modules/transactions/domain/fiscalization-retry-policy'

import StatusBadge from '@/components/transactions/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type NonFiscalizedDetailsSheetProps = {
  transaction: TransactionListItem | null
  onClose: () => void
  onViewError: (transaction: TransactionListItem) => void
  onCopy: (label: string, value: string) => void
  onRetry: (transaction: TransactionListItem) => void
  onCancelFiscalization: (transaction: TransactionListItem) => void
  onSendNow: (transaction: TransactionListItem) => void
  onFiscalize: (transaction: TransactionListItem) => void
  onCopySupportBundle: (transaction: TransactionListItem) => void
  decimals: DecimalSettings
}

const canRetryFiscalization = (status: string) =>
  String(status || '').toUpperCase() === 'FAILED'

const canCancelFiscalization = (status: string) =>
  String(status || '').toUpperCase() === 'FISCALIZING'

const canSendNow = (status: string) =>
  ['OPEN', 'ALLOCATED', 'FAILED', 'PENDING'].includes(
    String(status || '').toUpperCase(),
  )

const canFiscalize = (status: string) =>
  ['OPEN', 'ALLOCATED', 'FAILED', 'PENDING'].includes(
    String(status || '').toUpperCase(),
  )

const hasLinkedCustomer = (transaction: TransactionListItem) =>
  Boolean(String(transaction.customerId || '').trim())

const canRetryTransaction = (transaction: TransactionListItem) =>
  canRetryFiscalization(transaction.status) &&
  !requiresCustomerForFiscalizationRetry({
    customerId: transaction.customerId,
    domsSourceSystem: transaction.domsSourceSystem,
  })

const NonFiscalizedDetailsSheet = ({
  transaction,
  onClose,
  onViewError,
  onCopy,
  onRetry,
  onCancelFiscalization,
  onSendNow,
  onFiscalize,
  onCopySupportBundle,
  decimals,
}: NonFiscalizedDetailsSheetProps) => (
  <Sheet
    open={Boolean(transaction)}
    onOpenChange={(open) => !open && onClose()}
  >
    <SheetContent side="right" className="flex h-dvh flex-col p-0">
      <SheetHeader className="px-6 pt-6">
        <SheetTitle>Transaction details</SheetTitle>
      </SheetHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
        {transaction && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Transaction ID
                </div>
                <div className="flex items-center gap-2">
                  <div className="font-medium text-[var(--text-primary)]">
                    {transaction.id}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 px-0"
                    onClick={() => onCopy('Transaction ID', transaction.id)}
                    aria-label="Copy transaction ID"
                    title="Copy transaction ID"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Receipt number
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[var(--text-secondary)]">
                    {transaction.receiptNumber ?? '—'}
                  </div>
                  {transaction.receiptNumber ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 px-0"
                      onClick={() =>
                        onCopy('Receipt number', transaction.receiptNumber ?? '')
                      }
                      aria-label="Copy receipt number"
                      title="Copy receipt number"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Transaction time
                </div>
                <div className="text-[var(--text-secondary)]">
                  {formatDate(transaction.transactionDateTime)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Pump</div>
                <div className="text-[var(--text-secondary)]">
                  {transaction.pumpNumber}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Fuel type
                </div>
                <div className="text-[var(--text-secondary)]">
                  {transaction.fuelType ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Volume</div>
                <div className="text-[var(--text-secondary)]">
                  {formatNumber(transaction.volume, decimals.volume)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Total amount
                </div>
                <div className="text-[var(--text-secondary)]">
                  {formatNumber(transaction.totalAmount, decimals.money)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Status</div>
                <StatusBadge status={transaction.status} />
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Retry count
                </div>
                <div className="text-[var(--text-secondary)]">
                  {transaction.retryCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Customer</div>
                <div className="text-[var(--text-secondary)]">
                  {transaction.customerName ||
                    transaction.customerTin ||
                    'Not linked'}
                </div>
                {transaction.customerName && transaction.customerTin ? (
                  <div className="text-xs text-[var(--text-muted)]">
                    {transaction.customerTin}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Queue enqueued
                </div>
                <div className="text-[var(--text-secondary)]">
                  {formatDate(transaction.fiscalQueueEnqueuedAt)}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-[var(--text-muted)]">
                  Last error
                </div>
                {transaction.lastError ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-[var(--text-primary)]">
                      {transaction.lastError.length > 240
                        ? `${transaction.lastError.slice(0, 240)}…`
                        : transaction.lastError}
                    </div>
                    <div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onViewError(transaction)}
                      >
                        View full error
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[var(--text-secondary)]">—</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="border-t bg-[var(--surface-card)] px-6 py-4">
        <SheetFooter>
          {transaction && canCancelFiscalization(transaction.status) ? (
            <Button
              variant="secondary"
              onClick={() => onCancelFiscalization(transaction)}
              className="gap-2"
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              Cancel fiscalization attempt
            </Button>
          ) : null}
          {transaction && canRetryTransaction(transaction) ? (
            <Button
              variant="secondary"
              onClick={() => onRetry(transaction)}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Retry fiscalization
            </Button>
          ) : null}
          {transaction && canFiscalize(transaction.status) ? (
            <Button
              variant="primary"
              onClick={() => onFiscalize(transaction)}
              className="gap-2"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              {hasLinkedCustomer(transaction)
                ? 'Review customer & fiscalize'
                : 'Link customer & fiscalize'}
            </Button>
          ) : null}
          {transaction &&
          canSendNow(transaction.status) &&
          hasLinkedCustomer(transaction) ? (
            <Button
              variant="secondary"
              onClick={() => onSendNow(transaction)}
              className="gap-2"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send now
            </Button>
          ) : null}
          {transaction ? (
            <Button
              variant="secondary"
              onClick={() => onCopySupportBundle(transaction)}
              className="gap-2"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Copy support bundle
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </div>
    </SheetContent>
  </Sheet>
)

export default NonFiscalizedDetailsSheet
