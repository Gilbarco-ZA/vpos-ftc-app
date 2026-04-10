'use client'

import type { TransactionBuilderProduct } from '@/components/transactions/TransactionProductEditor'
import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import TransactionProductEditor from '@/components/transactions/TransactionProductEditor'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const parseErrorMessage = (body: any, fallback: string) =>
  String(body?.error?.message || fallback)

type ManualTransactionPageClientProps = {
  products: TransactionBuilderProduct[]
  decimals: DecimalSettings
  backHref: string
}

export default function ManualTransactionPageClient({
  products,
  decimals,
  backHref,
}: ManualTransactionPageClientProps) {
  const router = useRouter()
  const [csrfToken, setCsrfToken] = useState('')
  const [success, setSuccess] = useState<{
    transactionId: string
    totalAmount: number
    lineCount: number
  } | null>(null)
  const [resetKey, setResetKey] = useState(0)

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      <PageHeader
        title="Classic transaction builder"
        description="Legacy transaction entry screen retained while the new POS flow is rolled out."
        actions={
          <Button asChild variant="secondary">
            <Link href="/pos">Open POS</Link>
          </Button>
        }
      />

      {success ? (
        <Card className="p-4 text-sm text-[var(--text-secondary)]">
          <div className="font-medium text-[var(--text-primary)]">
            Transaction created
          </div>
          <div className="mt-1">
            Transaction{' '}
            <span className="font-mono">{success.transactionId}</span> now has{' '}
            {success.lineCount} item{success.lineCount === 1 ? '' : 's'}.
          </div>
          <div className="mt-1">
            Total amount: {success.totalAmount.toFixed(2)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push(backHref)}>
              Back to transactions
            </Button>
            <Button variant="primary" onClick={() => setSuccess(null)}>
              Create another transaction
            </Button>
          </div>
        </Card>
      ) : null}

      <TransactionProductEditor
        products={products}
        decimals={decimals}
        resetKey={resetKey}
        catalogDisplay="picker"
        showTransactionFields
        submitLabel="Create transaction"
        submitBusyLabel="Creating transaction…"
        onSubmit={async (payload) => {
          const res = await fetch('/api/transactions/manual', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            body: JSON.stringify({
              csrf_token: csrfToken,
              pumpNumber: payload.pumpNumber,
              posReference: payload.posReference,
              lines: payload.lines,
              fuelSelection: payload.fuelSelection,
            }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok || body?.ok === false) {
            throw new Error(
              parseErrorMessage(body, 'Could not create the transaction.'),
            )
          }
          const data = body?.data ?? body
          setSuccess({
            transactionId: String(data?.transactionId ?? ''),
            totalAmount: Number(data?.totalAmount ?? 0),
            lineCount: Number(data?.lineCount ?? 0),
          })
          setResetKey((current) => current + 1)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </div>
  )
}
