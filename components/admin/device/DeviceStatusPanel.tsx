'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { safeAsync } from '@/src/shared/utils/safeAsync'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Skeleton } from '@/components/ui/skeleton'

type SetupStatus = {
  internet: boolean
  proxy: boolean
  vposUrl?: string
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
}

export const DeviceStatusPanel = () => {
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [registrationLoading, setRegistrationLoading] = useState(true)
  const [registration, setRegistration] = useState<RegistrationStatus | null>(
    null,
  )
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  )
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [registrationCode, setRegistrationCode] = useState('')

  const loadStatus = async () => {
    setLoadingStatus(true)
    setStatusError(null)
    try {
      const res = await fetch('/api/admin/device/registration', {
        cache: 'no-store',
      })
      const data = await safeAsync(res.json(), 'deviceStatus.parseStatus')
      if (!res.ok || data?.ok === false) {
        const payload = (data?.data ?? data) as any
        const message =
          payload?.message ||
          data?.data?.error?.message ||
          data?.error?.message ||
          'Failed to load proxy status'

        const proxyStatusCode = Number(data?.status || 0) || undefined
        setStatus(null)
        setStatusError(message)

        setStatus({
          internet:
            typeof navigator === 'undefined' ? true : Boolean(navigator.onLine),
          proxy: Boolean(proxyStatusCode || payload?.details),
          vposUrl: String(data?.url ?? ''),
        })
      } else {
        const payload = (data?.data ?? data) as any
        setStatus({
          internet:
            typeof navigator === 'undefined' ? true : Boolean(navigator.onLine),
          proxy: Boolean(payload?.ok ?? data?.ok ?? true),
          vposUrl: String(payload?.url ?? payload?.proxyUrl ?? ''),
        })
      }
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to load proxy status')
    } finally {
      setLoadingStatus(false)
    }
  }

  const loadRegistration = async () => {
    setRegistrationLoading(true)
    setRegistrationError(null)
    try {
      const res = await fetch('/api/admin/device/registration', {
        cache: 'no-store',
      })
      const data = await safeAsync(res.json(), 'deviceStatus.parseRegistration')
      if (!res.ok || data?.ok === false) {
        const payload = (data?.data ?? data) as any
        const message =
          payload?.message ||
          data?.data?.error?.message ||
          data?.error?.message ||
          'Failed to load registration status'

        const details =
          payload && typeof payload === 'object' && payload.details
            ? payload.details
            : null
        const proxyStatusCode = Number(data?.status || 0) || undefined
        const requiresRegistration =
          proxyStatusCode === 401 &&
          Boolean(details && details.isRegistered === false)

        if (requiresRegistration) {
          setRegistration({
            isRegistered: false,
            requiresRegistration: true,
            proxyStatusCode,
            errorMessage: message,
            deviceSettings: {
              isActive:
                typeof details?.isActive === 'boolean'
                  ? details.isActive
                  : undefined,
            },
            timestamps: { statusUpdatedAt: new Date().toISOString() },
          })
        } else {
          setRegistration(null)
        }

        setRegistrationError(message)
      } else {
        setRegistration((data?.data ?? data) as any)
      }
    } catch (err: any) {
      setRegistrationError(err?.message || 'Failed to load registration status')
    } finally {
      setRegistrationLoading(false)
    }
  }

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
      await loadStatus()
      await loadRegistration()
    } catch (err: any) {
      setRegistrationError(err?.message || `Failed to ${action}`)
    } finally {
      setActionBusy(null)
    }
  }

  useEffect(() => {
    loadStatus()
    loadRegistration()
  }, [])

  const registrationCodeValid = registrationCode.trim().length >= 6
  const requiresRegistration =
    registration?.requiresRegistration ||
    registration?.isRegistered === false ||
    /device not registered/i.test(registrationError || '') ||
    /device must be registered/i.test(registrationError || '')

  const showInitialLoading =
    (loadingStatus || registrationLoading) &&
    !status &&
    !registration &&
    !statusError &&
    !registrationError

  return (
    <Card className="animate-fade-up" style={{ animationDelay: '100ms' }}>
      <CardHeader className="space-y-1">
        <CardTitle>Device Status</CardTitle>
        <p className="text-sm text-[var(--text-muted)]">
          Connectivity and proxy health for this station.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {showInitialLoading ? (
          <div className="stagger-enter grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4"
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-5 w-24" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-1.5 h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {statusError ? (
              <ErrorDetails
                title="Unable to load device status"
                message="Check your connection and try again."
                error={statusError}
              />
            ) : null}

            <div className="relative">
              {loadingStatus || registrationLoading ? (
                <LoadingOverlay label="Refreshing device status…" />
              ) : null}

              <div className="stagger-enter grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="group rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Network
                  </div>
                  <div className="mt-2 font-semibold text-[var(--text-primary)]">
                    Detected
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    Local network connection available
                  </div>
                </div>

                <div className="group rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${status?.internet ? 'bg-emerald-500' : 'bg-red-500'}`}
                    />
                    Internet
                  </div>
                  <div className="mt-2 font-semibold text-[var(--text-primary)]">
                    {status?.internet ? 'Online' : 'Offline'}
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {status?.internet
                      ? 'Internet connection available'
                      : 'Internet connection unavailable'}
                  </div>
                </div>

                <div className="group rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${status?.proxy ? 'bg-emerald-500' : 'bg-red-500'}`}
                    />
                    VPOS Proxy
                  </div>
                  <div className="mt-2 font-semibold text-[var(--text-primary)]">
                    {status?.proxy ? 'Online' : 'Offline'}
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {status?.proxy
                      ? 'Proxy reachable'
                      : statusError || 'Proxy connectivity required'}
                  </div>
                </div>

                <div className="group rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${registration?.isRegistered ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    />
                    Registration
                  </div>
                  {registrationError ? (
                    <div className="mt-2">
                      <ErrorDetails
                        title="Registration issue"
                        message="The proxy registration status could not be loaded or updated."
                        error={registrationError}
                      />
                    </div>
                  ) : null}

                  <div className="mt-2 space-y-3 text-sm">
                    {requiresRegistration ? (
                      <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                        <Alert
                          icon={<AlertTriangle className="h-4 w-4" />}
                          variant="warn"
                        >
                          The proxy reports this device is not registered. Enter
                          the registration code to register this device again
                          without leaving the dashboard.
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
                              onChange={(e) =>
                                setRegistrationCode(
                                  e.target.value.toUpperCase(),
                                )
                              }
                              placeholder="Enter registration code"
                              autoComplete="off"
                            />
                            <Button
                              type="button"
                              onClick={() => performAction('register')}
                              disabled={
                                !!actionBusy ||
                                registrationLoading ||
                                !registrationCodeValid
                              }
                            >
                              {actionBusy === 'register'
                                ? 'Registering…'
                                : 'Register device'}
                            </Button>
                          </div>
                          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                            This uses the same proxy registration flow as the
                            setup wizard.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-muted)]">Status:</span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                          registrationLoading
                            ? 'bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                            : registration?.isRegistered
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {registrationLoading
                          ? 'Loading…'
                          : registration?.isRegistered
                            ? 'Registered'
                            : 'Not registered'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                          Site ID
                        </div>
                        <div className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
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
                        <div className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                          {registration?.deviceSettings?.deviceId || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                          Last updated
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">
                          {registration?.timestamps?.statusUpdatedAt
                            ? new Date(
                                registration.timestamps.statusUpdatedAt,
                              ).toLocaleString()
                            : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-[var(--border-default)] pt-4">
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

                    <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                      Refresh identity syncs details. Deregister allows
                      re-registration. Reset clears all cached settings.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-[var(--border-default)] pt-5">
              <Button
                variant="secondary"
                size="sm"
                onClick={loadStatus}
                disabled={loadingStatus}
                className="gap-2"
              >
                <svg
                  className={`h-4 w-4 ${loadingStatus ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {loadingStatus ? 'Refreshing...' : 'Refresh status'}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <div className="text-xs text-[var(--text-muted)]">Site ID</div>
                <div className="font-mono text-xs">
                  {registration?.identity?.siteId || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Site name
                </div>
                <div className="text-xs">
                  {registration?.identity?.siteName || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Device ID
                </div>
                <div className="font-mono text-xs">
                  {registration?.deviceSettings?.deviceId || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Last updated
                </div>
                <div className="text-xs">
                  {registration?.timestamps?.statusUpdatedAt
                    ? new Date(
                        registration.timestamps.statusUpdatedAt,
                      ).toLocaleString()
                    : '—'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
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
                onClick={() => performAction('deregister')}
                disabled={!!actionBusy}
              >
                {actionBusy === 'deregister' ? 'Deregistering…' : 'Deregister'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => performAction('reset')}
                disabled={!!actionBusy}
              >
                {actionBusy === 'reset' ? 'Resetting…' : 'Reset registration'}
              </Button>
            </div>

            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Use “Refresh identity” if the initial registration returned
              incomplete details. Use “Deregister” to re-run registration.
              “Reset registration” clears cached settings for a clean start.
            </p>

            <div className="flex items-center justify-between">
              <Button
                variant="secondary"
                onClick={loadStatus}
                disabled={loadingStatus}
              >
                {loadingStatus ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
