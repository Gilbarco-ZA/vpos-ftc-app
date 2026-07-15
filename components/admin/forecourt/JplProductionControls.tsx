'use client'

import type { FormEvent, ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type CommandStatus = 'idle' | 'loading' | 'success' | 'error'

type CommandResult = {
  title: string
  status: CommandStatus
  message?: string
  data?: unknown
}

type CommandRequest = {
  title: string
  url: string
  method?: 'GET' | 'POST'
  params?: Record<string, string | number | boolean | null | undefined>
  body?: Record<string, unknown>
}

const trim = (value: string) => value.trim()

const hasValue = (value: string) => trim(value).length > 0

const appendParams = (
  url: string,
  params?: CommandRequest['params'],
): string => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === '') continue
    query.set(key, String(value))
  }
  const suffix = query.toString()
  return suffix ? `${url}?${suffix}` : url
}

const requestJson = async (request: CommandRequest) => {
  const method = request.method ?? 'GET'
  const response = await fetch(appendParams(request.url, request.params), {
    method,
    cache: 'no-store',
    headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
    body: method === 'POST' ? JSON.stringify(request.body ?? {}) : undefined,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.success === false || body?.ok === false) {
    const message =
      body?.message ||
      body?.error?.message ||
      body?.error ||
      `HTTP ${response.status}`
    throw Object.assign(new Error(String(message)), { body })
  }
  return body?.data ?? body
}

function ResultPanel({ result }: { result: CommandResult }) {
  if (result.status === 'idle') {
    return (
      <div className="rounded border bg-[var(--surface-card)] p-3 text-sm text-[var(--text-muted)]">
        Run a command to see the controller response.
      </div>
    )
  }

  return (
    <div className="rounded border bg-[var(--surface-card)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{result.title}</div>
        <Badge
          variant={
            result.status === 'success'
              ? STATUS_VARIANT.SUCCESS
              : result.status === 'error'
                ? STATUS_VARIANT.ERROR
                : STATUS_VARIANT.NEUTRAL
          }
        >
          {result.status}
        </Badge>
      </div>
      {result.message ? (
        <div className="mb-2 text-sm text-[var(--text-secondary)]">
          {result.message}
        </div>
      ) : null}
      {result.data !== undefined ? (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-[var(--text-muted)]">{hint}</span>
      ) : null}
    </label>
  )
}

export function JplProductionControls() {
  const [result, setResult] = useState<CommandResult>({
    title: 'JPL command result',
    status: 'idle',
  })

  const [pumpId, setPumpId] = useState('00')
  const [pumpGradeId, setPumpGradeId] = useState('00')
  const [totalsSubCode, setTotalsSubCode] = useState('00H')
  const [fallbackTotalsSeqNo, setFallbackTotalsSeqNo] = useState('00')
  const [fallbackTotalCount, setFallbackTotalCount] = useState('0')
  const [fallbackClearConfirmed, setFallbackClearConfirmed] = useState(false)

  const [tankId, setTankId] = useState('00')
  const [tgId, setTgId] = useState('00')
  const [wetstockPosId, setWetstockPosId] = useState('00')
  const [tgErrorCode, setTgErrorCode] = useState('00H')
  const [deliveryReportSeqNo, setDeliveryReportSeqNo] = useState('00')
  const [tankDeliverySeqNo, setTankDeliverySeqNo] = useState('00')
  const [deliveryClearConfirmed, setDeliveryClearConfirmed] = useState(false)

  const [pendingPriceSetId, setPendingPriceSetId] = useState('00')
  const [pendingActivationAt, setPendingActivationAt] =
    useState('00000000000000')
  const [priceReadType, setPriceReadType] = useState('current')

  const [fcDateTime, setFcDateTime] = useState('')
  const [operationModeNo, setOperationModeNo] = useState('0')
  const [echoData, setEchoData] = useState('1,2,3')

  const normalizedEchoData = useMemo(() => {
    return echoData
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.min(255, Math.trunc(value))))
  }, [echoData])

  const run = async (request: CommandRequest) => {
    setResult({ title: request.title, status: 'loading' })
    try {
      const data = await requestJson(request)
      setResult({ title: request.title, status: 'success', data })
    } catch (error: any) {
      setResult({
        title: request.title,
        status: 'error',
        message: error?.message || 'Command failed',
        data: error?.body,
      })
    }
  }

  const runForm =
    (request: CommandRequest) => async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      await run(request)
    }

  const commonPumpParams = {
    fpId: hasValue(pumpId) ? pumpId : undefined,
    FpId: hasValue(pumpId) ? pumpId : undefined,
    fcGradeId: hasValue(pumpGradeId) ? pumpGradeId : undefined,
    FcGradeId: hasValue(pumpGradeId) ? pumpGradeId : undefined,
    subCode: totalsSubCode,
  }

  const commonTankBody = {
    tankId: hasValue(tankId) ? tankId : undefined,
    TankId: hasValue(tankId) ? tankId : undefined,
    tgId: hasValue(tgId) ? tgId : undefined,
    TgId: hasValue(tgId) ? tgId : undefined,
    posId: hasValue(wetstockPosId) ? wetstockPosId : undefined,
    PosId: hasValue(wetstockPosId) ? wetstockPosId : undefined,
  }

  const deliveryClearBody = {
    DeliveryReportSeqNo: deliveryReportSeqNo,
    PosId: wetstockPosId,
    TankDeliveries: [
      {
        TgId: tgId,
        TankDeliverySeqNo: tankDeliverySeqNo,
      },
    ],
  }

  const pendingPriceBody = {
    FcPriceSetId: pendingPriceSetId,
    PriceSetActivationDateAndTime: pendingActivationAt,
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold">
                JPL production controls
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Operator/admin screens for the production-module commands added
                in the latest JPL passes.
              </p>
            </div>
            <Badge variant={STATUS_VARIANT.INFO}>JPL guarded</Badge>
          </div>

          <Alert variant="warn" title="Use live controls carefully">
            These actions send live DOMS JPL commands. Totals reads are safe;
            fallback clearing, tank blocking, tank resets, and forecourt mode
            changes affect controller state and should be used only during
            approved site operations.
          </Alert>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <div className="text-sm font-semibold">
                Pump totals and fallback totals
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Read JPL pump totals and clear fallback totals only after totals
                have been collected and reconciled.
              </p>
            </div>

            <form
              className="space-y-3"
              onSubmit={runForm({
                title: 'Fuelling point grade totals',
                url: '/api/pos/doms/getFpGradeTotals',
                params: commonPumpParams,
              })}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="FpId">
                  <Input
                    value={pumpId}
                    onChange={(event) => setPumpId(event.target.value)}
                    placeholder="00"
                  />
                </Field>
                <Field label="FcGradeId">
                  <Input
                    value={pumpGradeId}
                    onChange={(event) => setPumpGradeId(event.target.value)}
                    placeholder="00"
                  />
                </Field>
                <Field label="subCode">
                  <Select
                    value={totalsSubCode}
                    onChange={(event) => setTotalsSubCode(event.target.value)}
                  >
                    <option value="00H">00H</option>
                    <option value="01H">01H</option>
                  </Select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit">Read FP grade totals</Button>
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'Pump grade totals',
                      url: '/api/pos/doms/getPumpGradeTotals',
                      params: commonPumpParams,
                    })
                  }
                >
                  Read pump grade totals
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'Pump grade blend totals',
                      url: '/api/pos/doms/getPumpGradeBlendTotals',
                      params: commonPumpParams,
                    })
                  }
                >
                  Read blend totals
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'Fallback totals',
                      url: '/api/pos/doms/getFallbackTotals',
                      params: commonPumpParams,
                    })
                  }
                >
                  Read fallback totals
                </Button>
              </div>
            </form>

            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="mb-2 text-sm font-semibold">
                Clear fallback totals
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field
                  label="FbTotalsSeqNo"
                  hint="Sequence number returned by fallback totals."
                >
                  <Input
                    value={fallbackTotalsSeqNo}
                    onChange={(event) =>
                      setFallbackTotalsSeqNo(event.target.value)
                    }
                    placeholder="00"
                  />
                </Field>
                <Field
                  label="TotalNoFbTransactions"
                  hint="Use 0 only when protocol flow requires ZERO."
                >
                  <Input
                    value={fallbackTotalCount}
                    onChange={(event) =>
                      setFallbackTotalCount(event.target.value)
                    }
                    placeholder="0"
                  />
                </Field>
                <label className="flex items-center gap-2 pt-7 text-sm">
                  <input
                    type="checkbox"
                    checked={fallbackClearConfirmed}
                    onChange={(event) =>
                      setFallbackClearConfirmed(event.target.checked)
                    }
                  />
                  Totals collected and reconciled
                </label>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!fallbackClearConfirmed}
                  onClick={() =>
                    void run({
                      title: 'Clear fallback totals',
                      url: '/api/pos/doms/clearFallbackTotals',
                      method: 'POST',
                      body: {
                        FbTotalsSeqNo: fallbackTotalsSeqNo,
                        TotalNoFbTransactions: fallbackTotalCount,
                      },
                    })
                  }
                >
                  Clear fallback totals
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <div className="text-sm font-semibold">
                Wetstock lifecycle and tank controls
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Delivery marking, tank blocking, and tank gauge error recovery
                for active DOMS wetstock operations.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Field label="TankId">
                <Input
                  value={tankId}
                  onChange={(event) => setTankId(event.target.value)}
                  placeholder="00"
                />
              </Field>
              <Field label="TgId">
                <Input
                  value={tgId}
                  onChange={(event) => setTgId(event.target.value)}
                  placeholder="00"
                />
              </Field>
              <Field label="PosId">
                <Input
                  value={wetstockPosId}
                  onChange={(event) => setWetstockPosId(event.target.value)}
                  placeholder="00"
                />
              </Field>
              <Field label="TgErrorCode">
                <Input
                  value={tgErrorCode}
                  onChange={(event) => setTgErrorCode(event.target.value)}
                  placeholder="00H"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Tank control status',
                    url: '/api/pos/doms/getTankControlStatus',
                    params: { tankId, TankId: tankId },
                  })
                }
              >
                Read tank control status
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Mark delivery starting',
                    url: '/api/pos/doms/markDeliveryStarting',
                    method: 'POST',
                    body: commonTankBody,
                  })
                }
              >
                Mark delivery starting
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Mark delivery finished',
                    url: '/api/pos/doms/markDeliveryFinished',
                    method: 'POST',
                    body: commonTankBody,
                  })
                }
              >
                Mark delivery finished
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  void run({
                    title: 'Block tank',
                    url: '/api/pos/doms/blockTank',
                    method: 'POST',
                    body: commonTankBody,
                  })
                }
              >
                Block tank
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Unblock tank',
                    url: '/api/pos/doms/unblockTank',
                    method: 'POST',
                    body: commonTankBody,
                  })
                }
              >
                Unblock tank
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Clear tank gauge error',
                    url: '/api/pos/doms/clearTgError',
                    method: 'POST',
                    body: { ...commonTankBody, TgErrorCode: tgErrorCode },
                  })
                }
              >
                Clear TG error
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  void run({
                    title: 'Reset tank gauge',
                    url: '/api/pos/doms/resetTg',
                    method: 'POST',
                    body: commonTankBody,
                  })
                }
              >
                Reset TG
              </Button>
            </div>

            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">
                Guided delivery workflow
              </div>
              <p className="mb-3 text-xs text-[var(--text-secondary)]">
                Use these in sequence during a controlled delivery: open tank
                controller, start process, mark start/finish, stop process, read
                delivery data, then clear only the exact collected delivery
                sequence.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'Open tank controller',
                      url: '/api/pos/doms/openTankController',
                      method: 'POST',
                      body: commonTankBody,
                    })
                  }
                >
                  1. Open controller
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'Start delivery process',
                      url: '/api/pos/doms/startDeliveryProcess',
                      method: 'POST',
                      body: commonTankBody,
                    })
                  }
                >
                  2. Start process
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'Site delivery status',
                      url: '/api/pos/doms/getSiteDeliveryStatus',
                    })
                  }
                >
                  Read site status
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'All tank delivery data',
                      url: '/api/pos/doms/getAllTankDeliveryData',
                    })
                  }
                >
                  Read delivery data
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'Stop delivery process',
                      url: '/api/pos/doms/stopDeliveryProcess',
                      method: 'POST',
                      body: commonTankBody,
                    })
                  }
                >
                  Stop process
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'Close tank controller',
                      url: '/api/pos/doms/closeTankController',
                      method: 'POST',
                      body: commonTankBody,
                    })
                  }
                >
                  Close controller
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="DeliveryReportSeqNo">
                  <Input
                    value={deliveryReportSeqNo}
                    onChange={(event) =>
                      setDeliveryReportSeqNo(event.target.value)
                    }
                    placeholder="00"
                  />
                </Field>
                <Field label="TankDeliverySeqNo">
                  <Input
                    value={tankDeliverySeqNo}
                    onChange={(event) =>
                      setTankDeliverySeqNo(event.target.value)
                    }
                    placeholder="00"
                  />
                </Field>
                <Field label="Clear TgId">
                  <Input
                    value={tgId}
                    onChange={(event) => setTgId(event.target.value)}
                    placeholder="00"
                  />
                </Field>
                <label className="flex items-center gap-2 pt-7 text-sm">
                  <input
                    type="checkbox"
                    checked={deliveryClearConfirmed}
                    onChange={(event) =>
                      setDeliveryClearConfirmed(event.target.checked)
                    }
                  />
                  Delivery data reconciled
                </label>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!deliveryClearConfirmed}
                  onClick={() =>
                    void run({
                      title: 'Clear tank delivery data',
                      url: '/api/pos/doms/clearTankDeliveryData',
                      method: 'POST',
                      body: deliveryClearBody,
                    })
                  }
                >
                  Clear collected delivery data
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <div className="text-sm font-semibold">
                Price-bank verification and pending queue
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Read the active controller price bank, verify pending scheduled
                prices, and clear a pending price set only after confirming the
                activation target.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Read type">
                <Select
                  value={priceReadType}
                  onChange={(event) => setPriceReadType(event.target.value)}
                >
                  <option value="current">current</option>
                  <option value="pending">pending</option>
                </Select>
              </Field>
              <Field label="Pending FcPriceSetId">
                <Input
                  value={pendingPriceSetId}
                  onChange={(event) => setPendingPriceSetId(event.target.value)}
                  placeholder="00"
                />
              </Field>
              <Field label="Pending activation">
                <Input
                  value={pendingActivationAt}
                  onChange={(event) =>
                    setPendingActivationAt(event.target.value)
                  }
                  placeholder="YYYYMMDDhhmmss"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title:
                      priceReadType === 'pending'
                        ? 'Pending DOMS price set'
                        : 'Current DOMS price bank',
                    url: '/api/pos/doms/getGradePrices',
                    params: {
                      type: priceReadType,
                      fcPriceSetId:
                        priceReadType === 'pending'
                          ? pendingPriceSetId
                          : undefined,
                      activationAt:
                        priceReadType === 'pending'
                          ? pendingActivationAt
                          : undefined,
                    },
                  })
                }
              >
                Read price bank
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Pending DOMS price queue',
                    url: '/api/pos/doms/getGradePrices',
                    params: { type: 'pending' },
                  })
                }
              >
                List pending queue
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  !hasValue(pendingPriceSetId) || !hasValue(pendingActivationAt)
                }
                onClick={() =>
                  void run({
                    title: 'Clear pending DOMS price set',
                    url: '/api/pos/doms/clearPendingPriceSet',
                    method: 'POST',
                    body: pendingPriceBody,
                  })
                }
              >
                Clear pending price set
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <div className="text-sm font-semibold">
                Forecourt controller utilities
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Date/time, operation mode, and JPL echo diagnostics.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field
                label="FcDateAndTime"
                hint="YYYYMMDDhhmmss, or leave blank and use Set controller time to now."
              >
                <Input
                  value={fcDateTime}
                  onChange={(event) => setFcDateTime(event.target.value)}
                  placeholder="20260707213000"
                />
              </Field>
              <Field label="FcOperationModeNo">
                <Input
                  value={operationModeNo}
                  onChange={(event) => setOperationModeNo(event.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Forecourt date/time',
                    url: '/api/pos/doms/getFcDateTime',
                  })
                }
              >
                Read date/time
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Set forecourt date/time',
                    url: '/api/pos/doms/changeFcDateTime',
                    method: 'POST',
                    body: {
                      FcDateAndTime:
                        trim(fcDateTime) ||
                        new Date()
                          .toISOString()
                          .replaceAll('-', '')
                          .replaceAll(':', '')
                          .replaceAll('T', '')
                          .replaceAll('Z', '')
                          .replaceAll('.', '')
                          .slice(0, 14),
                    },
                  })
                }
              >
                Set controller time
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void run({
                    title: 'Forecourt operation mode status',
                    url: '/api/pos/doms/getFcOperationModeStatus',
                  })
                }
              >
                Read operation mode
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  void run({
                    title: 'Change forecourt operation mode',
                    url: '/api/pos/doms/changeFcOperationMode',
                    method: 'POST',
                    body: { FcOperationModeNo: operationModeNo },
                  })
                }
              >
                Change operation mode
              </Button>
            </div>

            <div className="rounded border bg-[var(--surface-card)] p-3">
              <Field
                label="Echo bytes"
                hint="Comma-separated byte values, for example 1,2,3."
              >
                <Input
                  value={echoData}
                  onChange={(event) => setEchoData(event.target.value)}
                  placeholder="1,2,3"
                />
              </Field>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void run({
                      title: 'JPL echo',
                      url: '/api/pos/doms/utilEcho',
                      method: 'POST',
                      body: { EchoData: normalizedEchoData },
                    })
                  }
                >
                  Send echo
                </Button>
                <span className="text-xs text-[var(--text-muted)]">
                  {normalizedEchoData.length} byte(s)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <ResultPanel result={result} />
      </div>
    </div>
  )
}
