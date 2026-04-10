'use client'

import { useState } from 'react'

import { CustomerSearchDialog } from '@/components/customers/CustomerSearchDialog'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Button } from '@/components/ui/button'

export function RowActionsClient({
  id,
  transactionId,
}: {
  id: number
  transactionId?: string | null
}) {
  const [csrfToken, setCsrfToken] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)

  const run = async (action: string) => {
    const errorText =
      action === 'MARK_FAILED' || action === 'MARK_DEAD'
        ? (prompt('Optional error text (leave blank for default):') ?? '')
        : ''

    const res = await fetch(`/api/runtime/fiscal/inbox/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, errorText: errorText || undefined }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed')
      alert(text)
      return
    }

    window.location.reload()
  }

  const allocate = async (txId: string, customer: any) => {
    if (!csrfToken) {
      alert('CSRF token not ready yet — please try again in a moment.')
      return
    }

    const tin = (customer?.tin ?? '').toString().trim().toUpperCase()
    const customerId = (customer?.id ?? '').toString().trim()

    if (!tin && !customerId) {
      alert('Selected customer is missing TIN/ID')
      return
    }

    setLinkBusy(true)
    try {
      const res = await fetch('/api/transactions/allocate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          transactionId: txId,
          ...(tin ? { tin } : { customerId }),
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success === false) {
        alert(
          data?.error || data?.message || `Request failed (HTTP ${res.status})`,
        )
        return
      }

      alert('Customer linked to transaction')
      setLinkOpen(false)
    } finally {
      setLinkBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <CsrfBootstrap onToken={setCsrfToken} />
      <Button variant="secondary" size="sm" onClick={() => run('REQUEUE')}>
        Requeue
      </Button>
      <Button variant="secondary" size="sm" onClick={() => run('MARK_FAILED')}>
        Mark FAILED
      </Button>
      <Button variant="secondary" size="sm" onClick={() => run('MARK_DEAD')}>
        Mark DEAD
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => run('MARK_PROCESSED')}
      >
        Mark PROCESSED
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          if (confirm('Delete this inbox row? This cannot be undone.'))
            run('DELETE')
        }}
      >
        Delete
      </Button>

      <CustomerSearchDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        initialTransactionId={transactionId}
        busy={linkBusy}
        onConfirm={({ transactionId: txId, customer }) =>
          allocate(txId, customer)
        }
      />

      <Button
        variant="primary"
        size="sm"
        onClick={() => setLinkOpen(true)}
        title={
          csrfToken ? 'Link a customer to the related transaction' : 'Loading…'
        }
        disabled={!csrfToken}
      >
        Link customer → transaction
      </Button>
    </div>
  )
}
