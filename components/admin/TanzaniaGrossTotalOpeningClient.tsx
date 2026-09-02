'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type ReceiptVerificationPrefixMode = 'development' | 'production' | 'manual'

type GrossTotalSummary = {
  openingGrossTotal: number
  localFiscalTurnover: number
  effectiveGrossTotal: number
  openingGrossTotalCaptured: boolean
  openingGrossTotalCapturedAt: string | null
  dailyCounter: number
  globalCounter: number
  dailyCounterDate: string | null
  deviceIdOverride: string | null
  receiptVerificationPrefixMode: ReceiptVerificationPrefixMode
  receiptVerificationPrefixOverride: string | null
  effectiveReceiptVerificationPrefix: string
}

const endpoint = '/api/admin/tanzania-fiscal/gross-total-opening'
const formatAmount = (value: number) =>
  new Intl.NumberFormat('en-TZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const formatCapturedAt = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-TZ', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not captured'

const messageFrom = (body: any, fallback: string) =>
  body?.error?.message || body?.message || fallback

export function TanzaniaGrossTotalOpeningClient() {
  const [summary, setSummary] = useState<GrossTotalSummary | null>(null)
  const [openingGrossTotal, setOpeningGrossTotal] = useState('0.00')
  const [dailyCounter, setDailyCounter] = useState('0')
  const [globalCounter, setGlobalCounter] = useState('0')
  const [deviceIdOverride, setDeviceIdOverride] = useState('')
  const [receiptVerificationPrefixMode, setReceiptVerificationPrefixMode] =
    useState<ReceiptVerificationPrefixMode>('development')
  const [
    receiptVerificationPrefixOverride,
    setReceiptVerificationPrefixOverride,
  ] = useState('')
  const [dailyCounterDirty, setDailyCounterDirty] = useState(false)
  const [globalCounterDirty, setGlobalCounterDirty] = useState(false)
  const [deviceIdOverrideDirty, setDeviceIdOverrideDirty] = useState(false)
  const [receiptVerificationPrefixDirty, setReceiptVerificationPrefixDirty] =
    useState(false)
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState<'load' | 'save' | null>('load')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const openingNotCaptured = summary?.openingGrossTotalCaptured === false

  const load = useCallback(async () => {
    setBusy('load')
    setError(null)
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          messageFrom(body, 'Failed to load Tanzania fiscal opening values'),
        )
      }
      const data = (body?.data ?? body) as GrossTotalSummary
      setSummary(data)
      setOpeningGrossTotal(Number(data.openingGrossTotal || 0).toFixed(2))
      setDailyCounter(String(Number(data.dailyCounter || 0)))
      setGlobalCounter(String(Number(data.globalCounter || 0)))
      setDeviceIdOverride(data.deviceIdOverride ?? '')
      setReceiptVerificationPrefixMode(
        data.receiptVerificationPrefixMode ?? 'development',
      )
      setReceiptVerificationPrefixOverride(
        data.receiptVerificationPrefixOverride ?? '',
      )
      setDailyCounterDirty(false)
      setGlobalCounterDirty(false)
      setDeviceIdOverrideDirty(false)
      setReceiptVerificationPrefixDirty(false)
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const save = async () => {
    if (!csrfToken || busy) return
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          openingGrossTotal,
          ...(dailyCounterDirty ? { dailyCounter } : {}),
          ...(globalCounterDirty ? { globalCounter } : {}),
          ...(deviceIdOverrideDirty ? { deviceIdOverride } : {}),
          ...(receiptVerificationPrefixDirty
            ? {
                receiptVerificationPrefixMode,
                receiptVerificationPrefixOverride:
                  receiptVerificationPrefixOverride,
              }
            : {}),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          messageFrom(body, 'Failed to save Tanzania fiscal opening values'),
        )
      }
      const data = (body?.data ?? body) as GrossTotalSummary
      setSummary(data)
      setOpeningGrossTotal(Number(data.openingGrossTotal || 0).toFixed(2))
      setDailyCounter(String(Number(data.dailyCounter || 0)))
      setGlobalCounter(String(Number(data.globalCounter || 0)))
      setDeviceIdOverride(data.deviceIdOverride ?? '')
      setReceiptVerificationPrefixMode(
        data.receiptVerificationPrefixMode ?? 'development',
      )
      setReceiptVerificationPrefixOverride(
        data.receiptVerificationPrefixOverride ?? '',
      )
      setDailyCounterDirty(false)
      setGlobalCounterDirty(false)
      setDeviceIdOverrideDirty(false)
      setReceiptVerificationPrefixDirty(false)
      setNotice('Tanzania fiscal settings saved.')
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiscal values and local compatibility settings</CardTitle>
        <CardDescription>
          Capture the cumulative grossTotal baseline and receipt counters,
          select the receipt verification environment, and manage optional
          compatibility values.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CsrfBootstrap onToken={setCsrfToken} />
        <Alert variant={STATUS_VARIANT.WARN} title="Set these values carefully">
          Enter the last accepted grossTotal from the previous fiscal machine
          before the first transaction recorded by this installation. VPOS adds
          local fiscal turnover to this opening value. For a new station, save
          0.00 explicitly to confirm that its lifetime total starts here. The
          daily and global counters are also the last accepted values; the next
          invoice increments them before use. Lowering counters after invoices
          have been issued can create duplicate fiscal identifiers. Changing
          these values does not rewrite invoices or reports already queued or
          sent. Prefix changes apply only to verification numbers allocated
          after saving; existing assignments retain their original prefix.
          Device identity and EWURA licence values for Tanzania cloud
          submissions are resolved on the cloud server and are not sent by FTC.
        </Alert>
        {error ? (
          <Alert
            variant={STATUS_VARIANT.ERROR}
            title="Unable to update fiscal values"
          >
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert variant={STATUS_VARIANT.SUCCESS} title="Fiscal values updated">
            {notice}
          </Alert>
        ) : null}

        {openingNotCaptured ? (
          <Alert
            variant={STATUS_VARIANT.ERROR}
            title="Opening total not confirmed"
          >
            Save the correct opening grossTotal before submitting Tanzania daily
            totals. Save 0.00 for a new station.
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Opening total</p>
            <p className="mt-1 text-lg font-semibold">
              {summary ? formatAmount(summary.openingGrossTotal) : '—'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              Turnover recorded locally
            </p>
            <p className="mt-1 text-lg font-semibold">
              {summary ? formatAmount(summary.localFiscalTurnover) : '—'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              Effective grossTotal
            </p>
            <p className="mt-1 text-lg font-semibold">
              {summary ? formatAmount(summary.effectiveGrossTotal) : '—'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Baseline status</p>
            <p className="mt-1 text-lg font-semibold">
              {summary?.openingGrossTotalCaptured ? 'Captured' : 'Not captured'}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {summary
                ? formatCapturedAt(summary.openingGrossTotalCapturedAt)
                : '—'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              Current daily counter
            </p>
            <p className="mt-1 text-lg font-semibold">
              {summary ? summary.dailyCounter : '—'}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {summary?.dailyCounterDate || 'Current station date'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              Current global counter
            </p>
            <p className="mt-1 text-lg font-semibold">
              {summary ? summary.globalCounter : '—'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              Receipt verification prefix
            </p>
            <p className="mt-1 text-lg font-semibold">
              {summary?.effectiveReceiptVerificationPrefix || '—'}
            </p>
            <p className="text-muted-foreground mt-1 text-xs capitalize">
              {summary?.receiptVerificationPrefixMode || 'Not loaded'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              Local Device ID override
            </p>
            <p className="mt-1 text-lg font-semibold">
              {summary?.deviceIdOverride ? 'Stored locally' : 'Not configured'}
            </p>
            <p className="text-muted-foreground mt-1 break-all text-xs">
              {summary?.deviceIdOverride ||
                'No local compatibility override is stored'}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <FormField
            label="Opening cumulative gross total"
            helpText="Save 0.00 for a new station, or enter the previous machine's last accepted lifetime grossTotal."
            required
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={openingGrossTotal}
              disabled={busy !== null}
              onChange={(event) => setOpeningGrossTotal(event.target.value)}
            />
          </FormField>

          <FormField
            label="Daily counter"
            helpText={`Last accepted daily counter for ${summary?.dailyCounterDate || 'the current station date'}. The next invoice uses this value + 1.`}
            required
          >
            <Input
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              value={dailyCounter}
              disabled={busy !== null}
              onChange={(event) => {
                setDailyCounter(event.target.value)
                setDailyCounterDirty(true)
              }}
            />
          </FormField>

          <FormField
            label="Global counter"
            helpText="Last accepted lifetime receipt counter. The next invoice uses this value + 1."
            required
          >
            <Input
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              value={globalCounter}
              disabled={busy !== null}
              onChange={(event) => {
                setGlobalCounter(event.target.value)
                setGlobalCounterDirty(true)
              }}
            />
          </FormField>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <FormField
            label="Receipt verification environment"
            helpText="Development uses F1D845. Production uses 4BC37A. Choose Manual override only when a different authority-issued prefix is required."
            required
          >
            <Select
              value={receiptVerificationPrefixMode}
              disabled={busy !== null}
              onChange={(event) => {
                setReceiptVerificationPrefixMode(
                  event.target.value as ReceiptVerificationPrefixMode,
                )
                setReceiptVerificationPrefixDirty(true)
              }}
            >
              <option value="development">Development (F1D845)</option>
              <option value="production">Production (4BC37A)</option>
              <option value="manual">Manual override</option>
            </Select>
          </FormField>

          <FormField
            label="Manual receipt prefix"
            helpText="Exactly 6 letters or numbers. This value is used only when Manual override is selected."
            required={receiptVerificationPrefixMode === 'manual'}
          >
            <Input
              type="text"
              minLength={6}
              maxLength={6}
              pattern="[A-Za-z0-9]{6}"
              autoComplete="off"
              spellCheck={false}
              value={receiptVerificationPrefixOverride}
              disabled={
                busy !== null || receiptVerificationPrefixMode !== 'manual'
              }
              placeholder="ABC123"
              onChange={(event) => {
                setReceiptVerificationPrefixOverride(
                  event.target.value.toUpperCase(),
                )
                setReceiptVerificationPrefixDirty(true)
              }}
            />
          </FormField>
        </div>

        <FormField
          label="Device ID override"
          helpText="Optional compatibility value retained locally. FTC does not send this value as deviceId or x-device-id for Tanzania invoices, daily totals, or tank inventory; cloud-side configuration owns the effective device identity."
        >
          <Input
            type="text"
            maxLength={191}
            autoComplete="off"
            spellCheck={false}
            value={deviceIdOverride}
            disabled={busy !== null}
            placeholder="Optional local compatibility value"
            onChange={(event) => {
              setDeviceIdOverride(event.target.value)
              setDeviceIdOverrideDirty(true)
            }}
          />
        </FormField>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={busy !== null || !csrfToken}
            onClick={() => void save()}
            className="gap-2"
          >
            {busy === 'save' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {busy === 'save' ? 'Saving…' : 'Save Tanzania fiscal settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default TanzaniaGrossTotalOpeningClient
