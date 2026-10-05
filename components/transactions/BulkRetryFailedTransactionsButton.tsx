'use client'

import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/confirm-dialog'

export function BulkRetryFailedTransactionsButton(props: {
  transactionIds: string[]
  csrfToken: string
  onCompleted?: (result: {
    requested: number
    retried: number
    skipped: number
  }) => void | Promise<void>
}) {
  const ids = useMemo(
    () => Array.from(new Set(props.transactionIds.filter(Boolean))).slice(0, 200),
    [props.transactionIds],
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  if (ids.length === 0) return null

  const run = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/transactions/retry-failed', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': props.csrfToken,
        },
        body: JSON.stringify({
          csrf_token: props.csrfToken,
          transactionIds: ids,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error?.message || 'Failed to reset transactions')
      }
      const result = body?.data ?? body
      setConfirmOpen(false)
      await props.onCompleted?.({
        requested: Number(result?.requested ?? ids.length),
        retried: Number(result?.retried ?? 0),
        skipped: Number(result?.skipped ?? 0),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setConfirmOpen(true)}
        disabled={!props.csrfToken || loading}
        className="gap-2"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reset Failed ({ids.length})
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset all failed transactions?"
        description="This will re-queue every FAILED transaction currently shown in this list. Transactions that still require a customer link or are no longer FAILED will be skipped."
        confirmText="Reset failed"
        confirmVariant="secondary"
        loading={loading}
        onOpenChange={setConfirmOpen}
        onConfirm={run}
      />
    </>
  )
}

export default BulkRetryFailedTransactionsButton
