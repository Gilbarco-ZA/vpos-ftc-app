'use client'

import type { BadgeVariant } from '@/components/ui/badge'
import type {
  TanzaniaDailyTotalSubmissionHistoryItem,
  TanzaniaDailyTotalSubmissionStatus,
} from '@/src/modules/tanzania-fiscal/infrastructure/dailyTotalsStore'
import type { TanzaniaDailyTotalRequest } from '@/src/modules/tanzania-fiscal/infrastructure/proxyDailyTotals'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Printer, RefreshCw, Send } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const endpoint = '/api/tanzania/daily-totals'

type DashboardData = {
  timezone: string
  sendTime: string
  latestClosedBusinessDate: string
  submissions: TanzaniaDailyTotalSubmissionHistoryItem[]
}

const money = (value: unknown) =>
  new Intl.NumberFormat('en-TZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const volume = (value: unknown) =>
  new Intl.NumberFormat('en-TZ', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value || 0))

const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-TZ', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'

const statusVariant = (
  status: TanzaniaDailyTotalSubmissionStatus,
): BadgeVariant => {
  if (status === 'SENT') return 'success'
  if (status === 'QUEUED' || status === 'SENDING') return 'info'
  if (status === 'FAILED') return 'error'
  return 'warn'
}

const messageFrom = (body: any, fallback: string) =>
  body?.error?.message || body?.message || fallback

function ReportSummary({ payload }: { payload: TanzaniaDailyTotalRequest }) {
  const taxRows = ['A', 'B', 'C', 'D', 'E'].map((code) => ({
    code,
    net: Number(payload[`net${code}` as keyof TanzaniaDailyTotalRequest] || 0),
    tax: Number(payload[`tax${code}` as keyof TanzaniaDailyTotalRequest] || 0),
    rate: Number(
      payload[`vatRate${code}` as keyof TanzaniaDailyTotalRequest] || 0,
    ),
  }))

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Daily total</p>
          <p className="mt-1 font-semibold">
            TZS {money(payload.dailyTotalAmount)}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Gross total</p>
          <p className="mt-1 font-semibold">TZS {money(payload.grossTotal)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Fiscal tickets</p>
          <p className="mt-1 font-semibold">{payload.ticketsFiscalCount}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Station volume</p>
          <p className="mt-1 font-semibold">
            {volume(payload.totalStnVolume)} L
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Payments</h4>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Cash</dt>
              <dd>TZS {money(payload.pmtCash)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Card</dt>
              <dd>TZS {money(payload.pmtCard)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Cheque</dt>
              <dd>TZS {money(payload.pmtCheque)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Invoice</dt>
              <dd>TZS {money(payload.pmtInvoice)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Mobile</dt>
              <dd>TZS {money(payload.pmtMobile)}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Fuel volumes</h4>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Petrol</dt>
              <dd>{volume(payload.totalPetrol)} L</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Diesel</dt>
              <dd>{volume(payload.totalDiesel)} L</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Kerosene</dt>
              <dd>{volume(payload.totalKerosene)} L</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Discounts</dt>
              <dd>TZS {money(payload.discountsTotal)}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Fuel transactions</h4>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Petrol</dt>
              <dd>{payload.trnPetrol}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Diesel</dt>
              <dd>{payload.trnDiesel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Kerosene</dt>
              <dd>{payload.trnKerosene}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Voids</dt>
              <dd>{payload.ticketsVoid}</dd>
            </div>
          </dl>
        </div>
      </div>

      {payload.tanks?.length ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold">
            Physical tank inventory
          </h4>
          <p className="text-muted-foreground mb-2 text-xs print:text-black">
            Each row represents one physical tank from the complete ATG capture.
            Tank groups are not aggregated in this daily report.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs print:text-[9px]">
              <thead className="bg-[var(--surface-hover)] print:bg-white">
                <tr>
                  <th className="px-2 py-2 text-left">Tank</th>
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="px-2 py-2 text-right">Sales</th>
                  <th className="px-2 py-2 text-right">Opening L</th>
                  <th className="px-2 py-2 text-right">Delivery L</th>
                  <th className="px-2 py-2 text-right">Sold L</th>
                  <th className="px-2 py-2 text-right">ATG closing L</th>
                  <th className="px-2 py-2 text-right">Calculated L</th>
                  <th className="px-2 py-2 text-right">Variance L</th>
                </tr>
              </thead>
              <tbody>
                {payload.tanks.map((tank) => (
                  <tr key={tank.tankId} className="border-t">
                    <td className="px-2 py-2 font-medium">{tank.tankId}</td>
                    <td className="px-2 py-2">{tank.tankProdName}</td>
                    <td className="px-2 py-2 text-right">{tank.saleNumber}</td>
                    <td className="px-2 py-2 text-right">
                      {volume(tank.startVolume)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {volume(tank.atgDeliveryVolume)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {volume(tank.saleVolume)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {volume(tank.measuredEndVolume)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {volume(tank.calculatedEndVolume)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {volume(tank.volumeDifference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 text-sm font-semibold">Tax summary</h4>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-hover)]">
              <tr>
                <th className="px-3 py-2 text-left">Bucket</th>
                <th className="px-3 py-2 text-right">VAT rate</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">Tax</th>
              </tr>
            </thead>
            <tbody>
              {taxRows.map((row) => (
                <tr key={row.code} className="border-t">
                  <td className="px-3 py-2">{row.code}</td>
                  <td className="px-3 py-2 text-right">{row.rate}%</td>
                  <td className="px-3 py-2 text-right">{money(row.net)}</td>
                  <td className="px-3 py-2 text-right">{money(row.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PrintableReport({
  item,
}: {
  item: TanzaniaDailyTotalSubmissionHistoryItem
}) {
  const payload = item.requestPayload
  return (
    <section className="hidden bg-white p-8 text-black print:block">
      <div className="mb-6 border-b border-black pb-4">
        <h1 className="text-2xl font-bold">Tanzania Daily Fiscal Report</h1>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div>
            <strong>Business date:</strong> {item.businessDate}
          </div>
          <div>
            <strong>Z number:</strong> {payload.zNumber}
          </div>
          <div>
            <strong>Report time:</strong> {payload.reportTime}
          </div>
          <div>
            <strong>Status:</strong> {item.status}
          </div>
          <div>
            <strong>Submitted:</strong> {dateTime(item.submittedAt)}
          </div>
          <div>
            <strong>Proxy request:</strong> {item.proxyRequestId || '—'}
          </div>
        </div>
      </div>
      <ReportSummary payload={payload} />
      {item.lastError ? (
        <div className="mt-6 border border-black p-3 text-sm">
          <strong>Last submission error:</strong> {item.lastError}
        </div>
      ) : null}
      <p className="mt-8 border-t border-black pt-3 text-xs">
        Printed from VPOS FTC. This report represents the payload recorded for
        the selected Tanzania business date.
      </p>
    </section>
  )
}

export function TanzaniaDailyTotalsClient({
  canManage,
}: {
  canManage: boolean
}) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [sendTime, setSendTime] = useState('00:00')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState<string | null>('load')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selected = useMemo(
    () => data?.submissions.find((item) => item.id === selectedId) ?? null,
    [data, selectedId],
  )

  const load = useCallback(async () => {
    setBusy('load')
    setError(null)
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          messageFrom(body, 'Failed to load Tanzania daily totals'),
        )
      }
      const next = (body?.data ?? body) as DashboardData
      setData(next)
      setSendTime(next.sendTime)
      setSelectedId((current) =>
        current && next.submissions.some((item) => item.id === current)
          ? current
          : next.submissions[0]?.id || null,
      )
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const mutate = async (body: Record<string, unknown>, busyKey: string) => {
    if (!csrfToken || busy) return null
    setBusy(busyKey)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(body),
      })
      const responseBody = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          messageFrom(responseBody, 'Tanzania daily totals action failed'),
        )
      }
      return responseBody?.data ?? responseBody
    } catch (reason: any) {
      setError(reason?.message || String(reason))
      return null
    } finally {
      setBusy(null)
    }
  }

  const saveSchedule = async () => {
    const result = await mutate(
      { action: 'save-schedule', sendTime },
      'schedule',
    )
    if (!result) return
    setNotice(
      `Daily totals will be scheduled for ${result.sendTime} (${result.timezone}).`,
    )
    await load()
  }

  const forceSend = async (businessDate?: string) => {
    const target = businessDate || data?.latestClosedBusinessDate
    if (!target) return
    const result = await mutate(
      { action: 'force-send', businessDate: target },
      `force:${target}`,
    )
    if (!result) return
    setNotice(
      result.queued
        ? `Daily total ${target} was accepted into the proxy queue.`
        : `Daily total ${target} was submitted successfully.`,
    )
    await load()
  }

  const printItem = (item: TanzaniaDailyTotalSubmissionHistoryItem) => {
    setSelectedId(item.id)
    setTimeout(() => window.print(), 50)
  }

  return (
    <>
      <div className="space-y-4 print:hidden">
        <CsrfBootstrap onToken={setCsrfToken} />
        <PageHeader
          eyebrow="Tanzania fiscal services"
          title="Daily totals"
          description="Review the daily fiscal totals recorded and submitted for this Tanzania site, print historical reports, and monitor proxy submission status."
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => void load()}
                disabled={busy !== null}
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
              {canManage ? (
                <Button
                  variant="neon-amber"
                  disabled={
                    busy !== null ||
                    !csrfToken ||
                    !data?.latestClosedBusinessDate
                  }
                  onClick={() => void forceSend()}
                >
                  {busy?.startsWith('force:') ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Force send latest closed day
                </Button>
              ) : null}
            </>
          }
        />

        {error ? (
          <Alert variant="error" title="Daily totals error">
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert variant="success" title="Daily totals updated">
            {notice}
          </Alert>
        ) : null}
        {canManage ? (
          <Alert variant="warn" title="Temporary manual send control">
            Normal operation sends one report per closed business day at the
            configured station-local time. Force send is intended for
            commissioning and recovery and may be removed later. It reuses the
            date-scoped idempotency key.
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Automatic send schedule</CardTitle>
            <CardDescription>
              The worker checks regularly but only creates the previous closed
              business-day report after this station-local time is reached.
              Default is midnight (00:00).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr] md:items-end">
              <FormField
                label="Daily send time"
                helpText={`Station timezone: ${data?.timezone || 'loading…'}`}
              >
                <Input
                  type="time"
                  value={sendTime}
                  disabled={!canManage || busy !== null}
                  onChange={(event) => setSendTime(event.target.value)}
                />
              </FormField>
              <div className="flex flex-wrap items-center gap-3">
                {canManage ? (
                  <Button
                    disabled={busy !== null || !csrfToken}
                    onClick={() => void saveSchedule()}
                  >
                    {busy === 'schedule' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Save schedule
                  </Button>
                ) : null}
                <p className="text-muted-foreground text-sm">
                  Latest closed business date:{' '}
                  <strong>{data?.latestClosedBusinessDate || '—'}</strong>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submission history</CardTitle>
            <CardDescription>
              Up to the latest 120 recorded Tanzania daily-total submissions are
              shown below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {busy === 'load' && !data ? (
              <div className="flex items-center gap-2 py-8 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading daily
                totals…
              </div>
            ) : data?.submissions.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business date</TableHead>
                    <TableHead>Z number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Daily total</TableHead>
                    <TableHead>Gross total</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.submissions.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.businessDate}
                      </TableCell>
                      <TableCell>{item.zNumber}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(item.status)} dot>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        TZS {money(item.requestPayload.dailyTotalAmount)}
                      </TableCell>
                      <TableCell>
                        TZS {money(item.requestPayload.grossTotal)}
                      </TableCell>
                      <TableCell>{dateTime(item.submittedAt)}</TableCell>
                      <TableCell>{item.retryCount}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedId(item.id)}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => printItem(item)}
                          >
                            <Printer className="h-3.5 w-3.5" /> Print
                          </Button>
                          {canManage ? (
                            <Button
                              size="sm"
                              variant="neon-amber"
                              disabled={
                                busy !== null ||
                                !csrfToken ||
                                item.status === 'SENDING' ||
                                item.status === 'QUEUED'
                              }
                              onClick={() => void forceSend(item.businessDate)}
                            >
                              {busy === `force:${item.businessDate}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Force send
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground py-8 text-sm">
                No Tanzania daily-total submissions have been recorded yet.
              </p>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Report {selected.businessDate}</CardTitle>
                  <CardDescription>
                    Z number {selected.zNumber} · {selected.status} · last
                    updated {dateTime(selected.updatedAt)}
                  </CardDescription>
                </div>
                <Button variant="ghost" onClick={() => printItem(selected)}>
                  <Printer className="h-4 w-4" /> Print report
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {selected.lastError ? (
                <Alert variant="error" title="Last submission error">
                  {selected.lastError}
                </Alert>
              ) : null}
              <ReportSummary payload={selected.requestPayload} />
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">
                    Proxy request ID
                  </span>
                  <p className="break-all font-medium">
                    {selected.proxyRequestId || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Next retry</span>
                  <p className="font-medium">
                    {dateTime(selected.nextRetryAt)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p className="font-medium">{dateTime(selected.createdAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Updated</span>
                  <p className="font-medium">{dateTime(selected.updatedAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {selected ? <PrintableReport item={selected} /> : null}
    </>
  )
}

export default TanzaniaDailyTotalsClient
