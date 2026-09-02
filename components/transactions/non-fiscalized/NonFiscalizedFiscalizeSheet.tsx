'use client'

import type {
  CustomerState,
  FiscalizeFormErrors,
  LocalReceiptFields,
  NonFiscalizedFiscalizeSheetProps,
  ResolvedCustomer,
} from '@/components/transactions/non-fiscalized/types'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'

import { formatNumber } from '@/src/shared/utils/format'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const isKenyaStation = (country?: string | null) =>
  String(country || '')
    .trim()
    .toUpperCase() === 'KE'

const NonFiscalizedFiscalizeSheet = ({
  transaction,
  stationCountry,
  csrfToken,
  onClose,
  onSuccess,
  buyerTypeOptions,
  showToast,
  decimals,
}: NonFiscalizedFiscalizeSheetProps) => {
  const [tin, setTin] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [buyerType, setBuyerType] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [localReceiptFields, setLocalReceiptFields] =
    useState<LocalReceiptFields>({
      odometer: '',
      paymentType: 'CASH',
      vehicleRegNr: '',
    })
  const [customerState, setCustomerState] = useState<CustomerState>('idle')
  const [resolvedCustomer, setResolvedCustomer] =
    useState<ResolvedCustomer | null>(null)
  const [errors, setErrors] = useState<FiscalizeFormErrors>({})
  const [error, setError] = useState<unknown>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCopyingInvoice, setIsCopyingInvoice] = useState(false)
  const lookupRequestId = useRef(0)

  useEffect(() => {
    if (!transaction) return

    queueMicrotask(() => {
      const linkedCustomerId = String(transaction.customerId || '').trim()
      const linkedTin = String(transaction.customerTin || '').trim()
      const linkedBuyerName = String(transaction.customerName || '').trim()

      setTin(linkedTin)
      setBuyerName(linkedBuyerName)
      setBuyerType(buyerTypeOptions[0]?.value ?? '')
      const transactionPaymentType = String(transaction.paymentType || '')
        .trim()
        .toUpperCase()

      setContactPhone('')
      setContactEmail('')
      setLocalReceiptFields({
        odometer: String(transaction.odometer ?? ''),
        paymentType: transactionPaymentType === 'CARD' ? 'CARD' : 'CASH',
        vehicleRegNr: String(transaction.vehicleRegNr ?? ''),
      })
      setCustomerState(linkedCustomerId ? 'found' : 'idle')
      setResolvedCustomer(
        linkedCustomerId
          ? {
              id: linkedCustomerId,
              tin: linkedTin,
              buyerName: linkedBuyerName,
              buyerType: null,
              pin: null,
              contactPhone: null,
              contactEmail: null,
              country: null,
              odometer: transaction.odometer ?? null,
              paymentType: transaction.paymentType ?? null,
              vehicleRegNr: transaction.vehicleRegNr ?? null,
            }
          : null,
      )
      setErrors({})
      setError(null)
      setIsSubmitting(false)
    })
  }, [transaction, buyerTypeOptions])

  const validateTin = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return 'Customer TIN is required'
    if (trimmed.length < 4) return 'TIN is too short'
    if (!/^[0-9A-Za-z-]+$/.test(trimmed)) return 'TIN has invalid characters'
    return null
  }

  const mapCustomer = useCallback(
    (customer: Record<string, any>, fallbackTin: string): ResolvedCustomer => ({
      id: String(customer?.id ?? ''),
      tin: String(customer?.tin ?? fallbackTin),
      buyerName: String(customer?.buyer_name ?? customer?.buyerName ?? ''),
      buyerType: customer?.buyer_type ?? customer?.buyerType ?? null,
      pin: customer?.pin ?? null,
      contactPhone: customer?.contact_phone ?? customer?.contactPhone ?? null,
      contactEmail: customer?.contact_email ?? customer?.contactEmail ?? null,
      country: customer?.country ?? null,
      odometer: customer?.odometer ?? null,
      paymentType: customer?.payment_type ?? customer?.paymentType ?? null,
      vehicleRegNr: customer?.vehicle_reg_nr ?? customer?.vehicleRegNr ?? null,
    }),
    [],
  )

  const lookupCustomer = useCallback(
    async (
      value: string,
      options?: { foundState?: CustomerState; notFoundState?: CustomerState },
    ) => {
      const requestId = ++lookupRequestId.current
      setCustomerState('checking')
      setResolvedCustomer(null)
      setError(null)
      try {
        const res = await fetch(
          `/api/customers/lookup?tin=${encodeURIComponent(value)}`,
          { cache: 'no-store' },
        )
        const body = await res.json().catch(() => ({}))
        if (lookupRequestId.current !== requestId) return
        if (!res.ok || body?.ok === false) {
          setCustomerState('error')
          setError(res.ok ? body : { status: res.status, body })
          return
        }
        const payload = body?.data ?? body
        const customer = payload?.customer ?? null
        if (customer && customer.id) {
          const mapped = mapCustomer(customer, value)
          setResolvedCustomer(mapped)
          setCustomerState(options?.foundState ?? 'found')
          setBuyerName(mapped.buyerName)
          setBuyerType(mapped.buyerType || 'B2C')
          setLocalReceiptFields((current) => ({
            odometer: current.odometer.trim() || String(mapped.odometer ?? ''),
            paymentType:
              String(current.paymentType || mapped.paymentType || '')
                .trim()
                .toUpperCase() === 'CARD'
                ? 'CARD'
                : 'CASH',
            vehicleRegNr:
              current.vehicleRegNr.trim() || String(mapped.vehicleRegNr ?? ''),
          }))
          return
        }
        const notFoundState = options?.notFoundState ?? 'not_found'
        setCustomerState(notFoundState)
        if (notFoundState === 'error') {
          setError({
            message:
              'Customer created but could not be resolved. Please retry.',
          })
        }
      } catch (err: unknown) {
        if (lookupRequestId.current !== requestId) return
        setCustomerState('error')
        setError(err)
      }
    },
    [mapCustomer],
  )

  const handleTinBlur = async () => {
    const value = tin.trim()
    if (!value) {
      setCustomerState('idle')
      setResolvedCustomer(null)
      setErrors((prev) => ({ ...prev, tin: undefined }))
      return
    }
    const tinError = validateTin(value)
    if (tinError) {
      setErrors((prev) => ({ ...prev, tin: tinError }))
      setCustomerState('idle')
      setResolvedCustomer(null)
      return
    }
    setErrors((prev) => ({ ...prev, tin: undefined }))
    await lookupCustomer(value)
  }

  const handleCreateCustomer = async () => {
    const value = tin.trim()
    const nextErrors: FiscalizeFormErrors = {}
    const tinError = validateTin(value)
    if (tinError) nextErrors.tin = tinError
    if (!buyerName.trim()) nextErrors.buyerName = 'Buyer name is required'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setCustomerState('creating')
    setError(null)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          tin: value,
          pin: isKenyaStation(stationCountry) ? value : undefined,
          buyerName: buyerName.trim(),
          buyerType: buyerType.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok || body?.ok === false) {
        setCustomerState('error')
        setError(res.ok ? body : { status: res.status, body })
        return
      }

      setCustomerState('idle')
      await lookupCustomer(value, {
        foundState: 'created',
        notFoundState: 'error',
      })
    } catch (err: unknown) {
      setCustomerState('error')
      setError(err)
    }
  }

  const canQueue =
    (customerState === 'found' || customerState === 'created') &&
    Boolean(resolvedCustomer?.id) &&
    !isSubmitting

  const validate = () => {
    const nextErrors: FiscalizeFormErrors = {}
    const tinError = validateTin(tin)
    if (tinError) {
      nextErrors.tin = tinError
    } else if (!canQueue) {
      nextErrors.tin = 'Resolve the customer before queueing'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!transaction) return
    if (!transaction.id) {
      setError({
        message: 'Transaction ID is missing. Please refresh and try again.',
      })
      return
    }
    if (!validate()) return
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(transaction.id)}/fiscalize`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            csrf_token: csrfToken,
            customer: resolvedCustomer,
            customerId: resolvedCustomer?.id,
            odometer: localReceiptFields.odometer.trim(),
            paymentType: localReceiptFields.paymentType,
            vehicleRegNr: localReceiptFields.vehicleRegNr.trim(),
          }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setError(res.ok ? body : { status: res.status, body })
        setIsSubmitting(false)
        return
      }
      onSuccess(body?.data ?? body)
    } catch (err: unknown) {
      setError(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canShowCreate =
    customerState === 'not_found' ||
    customerState === 'idle' ||
    customerState === 'creating'

  const handleCopyInvoicePayload = async () => {
    if (!transaction) return
    setIsCopyingInvoice(true)
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(transaction.id)}/invoice-payload`,
        { cache: 'no-store' },
      )
      const body = await res.json().catch(() => ({}))
      const sample = body?.data?.sample ?? body?.sample ?? null
      if (!res.ok || !sample) {
        const msg =
          body?.error ||
          body?.message ||
          `Failed to build invoice payload (HTTP ${res.status})`
        throw new Error(String(msg))
      }
      await navigator.clipboard.writeText(JSON.stringify(sample, null, 2))
      showToast('success', 'Copied invoice payload')
    } catch (err: any) {
      showToast('error', String(err?.message || 'Copy failed'))
    } finally {
      setIsCopyingInvoice(false)
    }
  }

  return (
    <Sheet
      open={Boolean(transaction)}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent side="right" className="flex h-dvh flex-col p-0">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Fiscalize</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {transaction ? (
            <div className="space-y-4">
              <Card className="bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
                <div>
                  <span className="font-medium">Transaction:</span>{' '}
                  {transaction.id}
                </div>
                <div>
                  <span className="font-medium">Pump:</span>{' '}
                  {transaction.pumpNumber}
                </div>
                <div>
                  <span className="font-medium">Amount:</span>{' '}
                  {formatNumber(transaction.totalAmount, decimals.money)}
                </div>
                {transaction.posReference ? (
                  <div>
                    <span className="font-medium">POS ref:</span>{' '}
                    {transaction.posReference}
                  </div>
                ) : null}
              </Card>

              <form className="space-y-3" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--text-muted)]">
                    Customer TIN
                  </label>
                  <Input
                    value={tin}
                    onChange={(event) => setTin(event.target.value)}
                    onBlur={handleTinBlur}
                    placeholder="TIN"
                  />
                  {errors.tin && (
                    <div className="text-xs text-red-600">{errors.tin}</div>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge
                      variant={
                        customerState === 'found' ? 'success' : 'neutral'
                      }
                    >
                      {customerState === 'found'
                        ? 'Customer found'
                        : customerState === 'created'
                          ? 'Customer created'
                          : customerState === 'checking'
                            ? 'Checking'
                            : customerState === 'creating'
                              ? 'Creating'
                              : customerState === 'not_found'
                                ? 'Not found'
                                : customerState === 'error'
                                  ? 'Error'
                                  : 'Idle'}
                    </Badge>
                    {resolvedCustomer?.buyerName && (
                      <span className="text-[var(--text-muted)]">
                        {resolvedCustomer.buyerName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--text-muted)]">
                    Buyer name
                  </label>
                  <Input
                    value={buyerName}
                    onChange={(event) => setBuyerName(event.target.value)}
                    placeholder="Buyer name"
                  />
                  {errors.buyerName && (
                    <div className="text-xs text-red-600">
                      {errors.buyerName}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                      Buyer type
                    </label>
                    <Select
                      value={buyerType}
                      onChange={(event) => setBuyerType(event.target.value)}
                    >
                      {buyerTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                      Contact phone
                    </label>
                    <Input
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                      placeholder="Contact phone"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--text-muted)]">
                    Contact email
                  </label>
                  <Input
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="Contact email"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                      Odometer
                    </label>
                    <Input
                      value={localReceiptFields.odometer}
                      onChange={(event) =>
                        setLocalReceiptFields((prev) => ({
                          ...prev,
                          odometer: event.target.value,
                        }))
                      }
                      placeholder="125000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                      Payment type
                    </label>
                    <Select
                      value={localReceiptFields.paymentType}
                      onChange={(event) =>
                        setLocalReceiptFields((prev) => ({
                          ...prev,
                          paymentType: event.target.value as 'CASH' | 'CARD',
                        }))
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                      Vehicle reg no.
                    </label>
                    <Input
                      value={localReceiptFields.vehicleRegNr}
                      onChange={(event) =>
                        setLocalReceiptFields((prev) => ({
                          ...prev,
                          vehicleRegNr: event.target.value,
                        }))
                      }
                      placeholder="T123 ABC"
                    />
                  </div>
                </div>

                {error ? (
                  <Alert variant="error">
                    {error instanceof Error
                      ? error.message
                      : 'Something went wrong'}
                  </Alert>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {canShowCreate && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCreateCustomer}
                      disabled={customerState === 'creating'}
                    >
                      {customerState === 'creating'
                        ? 'Creating...'
                        : 'Create customer'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCopyInvoicePayload}
                    disabled={!transaction || isCopyingInvoice}
                    title="Copy the full invoice payload that would be sent to the proxy (sample casing)"
                  >
                    {isCopyingInvoice ? 'Copying...' : 'Copy invoice payload'}
                  </Button>
                  <Button type="submit" variant="primary" disabled={!canQueue}>
                    {isSubmitting ? 'Queueing...' : 'Queue fiscalization'}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
        <div className="border-t bg-[var(--surface-card)] px-6 py-4">
          <SheetFooter>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default NonFiscalizedFiscalizeSheet
