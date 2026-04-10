'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

type Customer = {
  id: string
  tin?: string | null
  trade_name?: string | null
  tradeName?: string | null
  buyer_name?: string | null
  buyerName?: string | null
  contact_name?: string | null
  contactName?: string | null
  phone?: string | null
  phone_number?: string | null
  mobile?: string | null
  email?: string | null
  country?: string | null
}

const displayCustomer = (c: Customer) => {
  const name = (
    c.trade_name ||
    c.tradeName ||
    c.buyer_name ||
    c.buyerName ||
    ''
  ).trim()

  const tin = (c.tin || '').trim()
  const phone = (c.phone || c.phone_number || c.mobile || '').trim()
  const email = (c.email || '').trim()
  const country = (c.country || '').trim()

  const meta = [
    tin ? `TIN: ${tin}` : '',
    phone,
    email,
    country ? `(${country})` : '',
  ]
    .filter(Boolean)
    .join(' • ')

  return {
    title: name || '(No customer name)',
    meta,
  }
}

export const AllocateTransactionModalForm = (props: {
  transactionId: string
  initialQuery?: string
  onSuccess?: () => void
  onError?: (message: string) => void
}) => {
  const [csrfToken, setCsrfToken] = useState('')
  const [query, setQuery] = useState(props.initialQuery || '')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<{
    local: Customer[]
    cloud: Customer[]
  }>({
    local: [],
    cloud: [],
  })

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  )
  const [customerId, setCustomerId] = useState('')
  const [tin, setTin] = useState('')
  const debounceRef = useRef<number | null>(null)

  const canSearch = useMemo(() => query.trim().length >= 2, [query])

  useEffect(() => {
    setErr(null)
    if (!canSearch) {
      setResults({ local: [], cloud: [] })
      return
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true)
        const res = await fetch(
          `/api/customers/search?query=${encodeURIComponent(query.trim())}&includeCloud=true`,
          { cache: 'no-store' },
        )
        if (!res.ok) throw new Error('Search failed')
        const data = await res.json()
        setResults({
          local: Array.isArray(data?.local) ? data.local : [],
          cloud: Array.isArray(data?.cloud) ? data.cloud : [],
        })
      } catch (e: any) {
        setErr(e?.message || 'Search failed')
        setResults({ local: [], cloud: [] })
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query, canSearch])

  const clearSelection = () => {
    setSelectedCustomer(null)
    setCustomerId('')
  }

  const selectLocal = (c: Customer) => {
    setSelectedCustomer(c)
    setCustomerId(String(c.id))
    setTin('')
    setErr(null)
  }

  const importCloud = async (cloudCustomerId: string) => {
    if (!csrfToken) throw new Error('CSRF token not ready')
    const body = new URLSearchParams()
    body.set('csrf_token', csrfToken)
    body.set('cloudCustomerId', cloudCustomerId)

    const res = await fetch('/api/customers/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-csrf-token': csrfToken,
      },
      body,
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(t || 'Import failed')
    }
    return res.json()
  }

  const selectCloud = async (c: Customer) => {
    try {
      setErr(null)
      setLoading(true)
      const imported = await importCloud(String(c.id))
      const localCustomer = imported?.data || imported
      if (!localCustomer?.id) throw new Error('Import returned no customer id')
      setSelectedCustomer(localCustomer)
      setCustomerId(String(localCustomer.id))
      setTin('')
    } catch (e: any) {
      setErr(e?.message || 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  const submitAllocate = async () => {
    if (!csrfToken) throw new Error('Security token not ready')
    const body = new URLSearchParams()
    body.set('csrf_token', csrfToken)
    body.set('transactionId', props.transactionId)
    if (customerId) body.set('customerId', customerId)
    if (!customerId && tin.trim()) body.set('tin', tin.trim())

    const res = await fetch('/api/transactions/allocate', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-csrf-token': csrfToken,
      },
      body,
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(t || 'Allocation failed')
    }
    await res.json().catch(() => ({}))
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setErr(null)
        try {
          setLoading(true)
          await submitAllocate()
          props.onSuccess?.()
        } catch (e: any) {
          const msg = e?.message || 'Allocation failed'
          setErr(msg)
          props.onError?.(msg)
        } finally {
          setLoading(false)
        }
      }}
      className="space-y-3"
    >
      <CsrfBootstrap onToken={setCsrfToken} />
      <CsrfHiddenInput token={csrfToken} />

      <div className="space-y-1">
        <FormField label="Customer">
          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface-card px-3 py-2">
              <div className="text-sm">
                <div className="font-medium">
                  {displayCustomer(selectedCustomer).title}
                </div>
                {displayCustomer(selectedCustomer).meta ? (
                  <div className="text-xs text-[var(--text-muted)]">
                    {displayCustomer(selectedCustomer).meta}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={clearSelection}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by TIN, customer name, phone, or email (min 2 chars)…"
              />

              {loading ? (
                <div className="text-xs text-[var(--text-muted)]">
                  Searching…
                </div>
              ) : null}

              {(results.local.length > 0 || results.cloud.length > 0) && (
                <div className="rounded-card border border-border bg-surface-card">
                  {results.local.length > 0 && (
                    <div className="border-b border-border px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
                      Local
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {results.local.map((c) => {
                      const d = displayCustomer(c)
                      return (
                        <Button
                          key={`l-${c.id}`}
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-start rounded-none px-3 py-2 text-left"
                          onClick={() => selectLocal(c)}
                        >
                          <div>
                            <div className="font-medium">{d.title}</div>
                            {d.meta ? (
                              <div className="text-xs text-[var(--text-muted)]">
                                {d.meta}
                              </div>
                            ) : null}
                          </div>
                        </Button>
                      )
                    })}
                  </div>

                  {results.cloud.length > 0 && (
                    <div className="border-y border-border px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
                      Cloud (will import on select)
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {results.cloud.map((c) => {
                      const d = displayCustomer(c)
                      return (
                        <Button
                          key={`c-${c.id}`}
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-start rounded-none px-3 py-2 text-left"
                          onClick={() => selectCloud(c)}
                        >
                          <div>
                            <div className="font-medium">{d.title}</div>
                            {d.meta ? (
                              <div className="text-xs text-[var(--text-muted)]">
                                {d.meta}
                              </div>
                            ) : null}
                          </div>
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </FormField>
      </div>

      <div className="space-y-1">
        <FormField
          label="Or allocate by TIN"
          helpText="If you select a customer above, this field is ignored."
        >
          <Input
            value={tin}
            onChange={(e) => {
              setTin(e.target.value)
              if (e.target.value) clearSelection()
            }}
            placeholder="TIN (if customer not selected)"
          />
        </FormField>
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={loading || (!customerId && !tin.trim())}
        className="w-full"
      >
        Allocate customer
      </Button>

      {err ? <Alert variant={STATUS_VARIANT.ERROR}>{err}</Alert> : null}
    </form>
  )
}
