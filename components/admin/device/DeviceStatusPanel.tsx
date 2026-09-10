'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { safeAsync } from '@/src/shared/utils/safeAsync'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Skeleton } from '@/components/ui/skeleton'

type ConnectionState = {
  status?: 'online' | 'offline' | 'unknown'
  connected?: boolean | null
  statusCode?: number | null
  responseTime?: number | null
  dnsResolved?: boolean | null
  networkReachable?: boolean | null
  url?: string | null
  error?: string | null
}

type OperationalStatus = {
  checkedAt?: string
  proxy?: ConnectionState & { health?: string | null }
  internet?: ConnectionState
  network?: ConnectionState
  printer?: {
    status?: 'online' | 'offline' | 'unknown' | 'not_configured'
    configured?: boolean
    connected?: boolean
    configuredCount?: number
    connectedCount?: number
    lastHeartbeatAt?: string | null
    stale?: boolean
    error?: string | null
  }
  license?: {
    status?: string | null
    expiresAt?: string | null
    expired?: boolean
    active?: boolean
    source?: 'registration' | 'fiscalization' | 'unknown'
    observedAt?: string | null
    message?: string | null
  }
}

type RegistrationStatus = {
  isRegistered?: boolean
  requiresRegistration?: boolean
  proxyStatusCode?: number
  errorMessage?: string
  identity?: {
    tenantId?: string
    siteId?: string
    siteName?: string
    countryCode?: string
    timezone?: string
    currencyCode?: string
  }
  deviceSettings?: {
    deviceId?: string | null
    deviceName?: string | null
    isActive?: boolean
    hasApiKey?: boolean
  }
  timestamps?: { statusUpdatedAt?: string }
  operationalStatus?: OperationalStatus
}

const connectionDot = (status?: string) => {
  if (status === 'online') return 'bg-emerald-500'
  if (status === 'offline') return 'bg-red-500'
  return 'bg-amber-500'
}

const connectionLabel = (status?: string) => {
  if (status === 'online') return 'Online'
  if (status === 'offline') return 'Offline'
  return 'Unknown'
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const StatusCard = ({
  label,
  status,
  detail,
}: {
  label: string
  status: 'online' | 'offline' | 'unknown'
  detail: string
}) => (
  <div className="group rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]">
    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
      <span className={`h-1.5 w-1.5 rounded-full ${connectionDot(status)}`} />
      {label}
    </div>
    <div className="mt-2 font-semibold text-[var(--text-primary)]">
      {connectionLabel(status)}
    </div>
    <div className="mt-1 text-xs text-[var(--text-muted)]">{detail}</div>
  </div>
)

export const DeviceStatusPanel = () => {
  const [loading, setLoading] = useState(true)
  const [registration, setRegistration] = useState<RegistrationStatus | null>(
    null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  )
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [registrationCode, setRegistrationCode] = useState('')

  const loadDeviceStatus = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setRegistrationError(null)

    try {
      const res = await fetch('/api/admin/device/registration', {
        cache: 'no-store',
      })
      const data = await safeAsync(res.json(), 'deviceStatus.parseStatus')
      const outerPayload = (data?.data ?? data) as any
      const payload =
        outerPayload && typeof outerPayload === 'object' && outerPayload.details
          ? outerPayload.details
          : outerPayload

      if (payload && typeof payload === 'object') {
        const proxyStatusCode = Number(data?.status || 0) || undefined
        const message =
          outerPayload?.message ||
          data?.data?.error?.message ||
          data?.error?.message ||
          null
        const requiresRegistration =
          proxyStatusCode === 401 && payload?.isRegistered === false

        setRegistration({
          ...payload,
          requiresRegistration:
            payload?.requiresRegistration ?? requiresRegistration,
          proxyStatusCode,
          errorMessage: message || undefined,
        })

        if (data?.ok === false && message) setRegistrationError(message)
      } else {
        setRegistration(null)
      }

      if (!res.ok) {
        setLoadError(
          data?.error?.message || data?.message || 'Failed to load device status',
        )
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load device status')
    } finally {
      setLoading(false)
    }
  }, [])

  const performAction = async (
    action: 'deregister' | 'reset' | 'refreshIdentity' | 'register',
  ) => {
    setActionBusy(action)
    setRegistrationError(null)
    try {
      const body: Record<string, any> = { action }
      if (action === 'register') {
        body.registrationCode = registrationCode.trim()
      }

      const res = await fetch('/api/admin/device/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await safeAsync(res.json(), 'deviceStatus.parseAction')
      if (!res.ok || data?.ok === false) {
        const message =
          data?.data?.error?.message ||
          data?.error?.message ||
          `Failed to ${action}`
        setRegistrationError(message)
      } else if (action === 'register') {
        setRegistrationCode('')
      }
      await loadDeviceStatus()
    } catch (err: any) {
      setRegistrationError(err?.message || `Failed to ${action}`)
    } finally {
      setActionBusy(null)
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadDeviceStatus())
  }, [loadDeviceStatus])

  const operational = registration?.operationalStatus
  const printer = operational?.printer
  const license = operational?.license
  const licenseExpired = license?.expired === true || license?.status === 'EXPIRED'
  const requiresRegistration =
    registration?.requiresRegistration ||
    registration?.isRegistered === false ||
    /device not registered/i.test(registrationError || '') ||
    /device must be registered/i.test(registrationError || '')
  const registrationCodeValid = registrationCode.trim().length >= 6

  const printerStatus =
    printer?.status === 'online'
      ? ('online' as const)
      : printer?.status === 'offline'
        ? ('offline' as const)
        : ('unknown' as const)
  const printerDetail =
    printer?.status === 'not_configured'
      ? 'No enabled printer configured'
      : printer?.status === 'online'
        ? `${printer.connectedCount ?? 0} of ${printer.configuredCount ?? 0} configured printer(s) reachable`
        : printer?.status === 'offline'
          ? printer.error || 'Configured printer is not reachable'
          : 'Printer connectivity status is unavailable or stale'

  const internetDetail =
    operational?.internet?.status === 'online'
      ? `Cloud reachable${operational.internet.responseTime != null ? ` in ${operational.internet.responseTime} ms` : ''}`
      : operational?.internet?.error || 'Cloud/internet connectivity unavailable'
  const proxyDetail =
    operational?.proxy?.status === 'online'
      ? operational.proxy.health &&
        operational.proxy.health.toLowerCase() !== 'healthy'
        ? `Proxy reachable; upstream health is ${operational.proxy.health}`
        : 'Local VPOS proxy reachable'
      : operational?.proxy?.error || 'VPOS proxy is not reachable'
  const networkDetail =
    operational?.network?.status === 'online'
      ? `Internal API reachable${operational.network.responseTime != null ? ` in ${operational.network.responseTime} ms` : ''}`
      : operational?.network?.error || 'Internal API connectivity unavailable'

  return (
    <Card className="animate-fade-up" style={{ animationDelay: '100ms' }}>
      <CardHeader className="space-y-1">
        <CardTitle>Device Status</CardTitle>
        <p className="text-sm text-[var(--text-muted)]">
          Registration, licence, printer, proxy, and upstream connectivity for
          this station.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && !registration && !loadError ? (
          <div className="stagger-enter grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4"
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-5 w-24" />
                <Skeleton className="mt-2 h-3 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {loadError ? (
              <ErrorDetails
                title="Unable to load device status"
                message="Some operational status information could not be loaded."
                error={loadError}
              />
            ) : null}

            <div className="relative">
              {loading ? <LoadingOverlay label="Refreshing device status…" /> : null}
              <div className="stagger-enter grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatusCard
                  label="Internet"
                  status={operational?.internet?.status ?? 'unknown'}
                  detail={internetDetail}
                />
                <StatusCard
                  label="VPOS Proxy"
                  status={operational?.proxy?.status ?? 'unknown'}
                  detail={proxyDetail}
                />
                <StatusCard
                  label="Internal API"
                  status={operational?.network?.status ?? 'unknown'}
                  detail={networkDetail}
                />
                <StatusCard
                  label="Printer"
                  status={printerStatus}
                  detail={printerDetail}
                />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Registration & licence
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        licenseExpired
                          ? 'bg-red-500/10 text-red-400'
                          : registration?.isRegistered
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          licenseExpired
                            ? 'bg-red-500'
                            : registration?.isRegistered
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                        }`}
                      />
                      {licenseExpired
                        ? 'Licence expired'
                        : registration?.isRegistered
                          ? 'Registered'
                          : 'Not registered'}
                    </span>
                    {license?.status ? (
                      <span className="text-xs text-[var(--text-muted)]">
                        Licence: {license.status}
                      </span>
                    ) : null}
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadDeviceStatus}
                  disabled={loading || !!actionBusy}
                >
                  {loading ? 'Refreshing…' : 'Refresh status'}
                </Button>
              </div>

              {licenseExpired ? (
                <div className="mt-4">
                  <Alert
                    icon={<AlertTriangle className="h-4 w-4" />}
                    variant="error"
                  >
                    The device is registered locally, but the last known fiscal
                    licence status is EXPIRED. Fiscalization will fail until the
                    licence is renewed or reactivated.
                  </Alert>
                </div>
              ) : null}

              {registrationError ? (
                <div className="mt-4">
                  <ErrorDetails
                    title="Registration issue"
                    message="The proxy registration status could not be fully loaded or updated."
                    error={registrationError}
                  />
                </div>
              ) : null}

              {requiresRegistration ? (
                <div className="mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <Alert
                    icon={<AlertTriangle className="h-4 w-4" />}
                    variant="warn"
                  >
                    The proxy reports this device is not registered. Enter the
                    registration code to register it again without leaving the
                    dashboard.
                  </Alert>
                  <div className="space-y-2">
                    <label
                      htmlFor="dashboard-registration-code"
                      className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]"
                    >
                      Registration code
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="dashboard-registration-code"
                        value={registrationCode}
                        onChange={(event) =>
                          setRegistrationCode(event.target.value.toUpperCase())
                        }
                        placeholder="Enter registration code"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        onClick={() => performAction('register')}
                        disabled={
                          !!actionBusy || loading || !registrationCodeValid
                        }
                      >
                        {actionBusy === 'register'
                          ? 'Registering…'
                          : 'Register device'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Registration
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {registration?.isRegistered ? 'Registered' : 'Not registered'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Licence status
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {license?.status || 'Unknown'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Licence expiry
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {formatDate(license?.expiresAt)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Licence observed
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {formatDate(license?.observedAt)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Site ID
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-[var(--text-secondary)]">
                    {registration?.identity?.siteId || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Site name
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {registration?.identity?.siteName || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Device ID
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-[var(--text-secondary)]">
                    {registration?.deviceSettings?.deviceId || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Last updated
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {formatDate(
                      operational?.checkedAt ||
                        registration?.timestamps?.statusUpdatedAt,
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border-default)] pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => performAction('refreshIdentity')}
                  disabled={!!actionBusy}
                >
                  {actionBusy === 'refreshIdentity'
                    ? 'Refreshing…'
                    : 'Refresh identity'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => performAction('deregister')}
                  disabled={!!actionBusy}
                >
                  {actionBusy === 'deregister'
                    ? 'Deregistering…'
                    : 'Deregister'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => performAction('reset')}
                  disabled={!!actionBusy}
                >
                  {actionBusy === 'reset' ? 'Resetting…' : 'Reset'}
                </Button>
              </div>

              {printer?.lastHeartbeatAt ? (
                <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                  Printer status last checked {formatDate(printer.lastHeartbeatAt)}.
                </p>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
