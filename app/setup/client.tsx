'use client'

import type { SelectOption } from '@/src/shared/types'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { readOptions } from '@/app/setup/helpers'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { TanzaniaProxyRegistrationClient } from '@/components/admin/TanzaniaProxyRegistrationClient'
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
import { ErrorDetails } from '@/components/ui/error-details'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Select } from '@/components/ui/select'

type Props = {
  proxyReachable: boolean
  proxyUrl?: string
  initialError?: string
  isRegistered?: boolean
  proxyCountryCode?: string
  stationCountry?: string
}

type SetupStep = 'register' | 'country' | 'tanzania' | 'admin'

type SiteProfile = {
  siteName: string
  taxNumber?: string
  address?: string
  country?: string
  currency?: string
  timezone?: string
}

type SetupCountryOption = SelectOption & {
  countryCode?: string
  countryName?: string
  currencyCode?: string | null
  timezone?: string | null
  defaultLanguageCode?: string | null
}

const SetupWizard = ({
  proxyReachable,
  proxyUrl,
  initialError,
  isRegistered,
  proxyCountryCode,
  stationCountry,
}: Props) => {
  const router = useRouter()
  const [proxyOk, setProxyOk] = useState(proxyReachable)
  const [csrfToken, setCsrfToken] = useState('')
  const [deviceRegistered, setDeviceRegistered] = useState(
    Boolean(isRegistered),
  )
  const [step, setStep] = useState<SetupStep>('register')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [siteSyncing, setSiteSyncing] = useState(false)
  const [error, setError] = useState<string | null>(initialError || null)

  useEffect(() => {
    if (isRegistered) return

    const restoreStoredStep = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem('vpos.setup.step')
        if (
          stored === 'register' ||
          stored === 'country' ||
          stored === 'tanzania' ||
          stored === 'admin'
        ) {
          setStep(stored)
        }
      } catch {}
    }, 0)

    return () => window.clearTimeout(restoreStoredStep)
  }, [isRegistered])

  useEffect(() => {
    try {
      window.localStorage.setItem('vpos.setup.step', step)
    } catch {}
  }, [step])

  const [registrationCode, setRegistrationCode] = useState('')
  const [registrationSuccess, setRegistrationSuccess] = useState(false)

  const [siteProfile, setSiteProfile] = useState<SiteProfile | null>(null)
  const [needsCountry, setNeedsCountry] = useState(false)
  const [countryOptions, setCountryOptions] = useState<SetupCountryOption[]>([])
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [country, setCountry] = useState(
    String(proxyCountryCode || stationCountry || '')
      .trim()
      .toUpperCase(),
  )

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')

  useEffect(() => {
    const loadCountries = async () => {
      setLoadingCountries(true)
      try {
        const res = await fetch('/api/config/setup-countries', {
          cache: 'no-store',
        })
        const json = await res.json().catch(() => ({}))
        const options = readOptions(json) as SetupCountryOption[]
        setCountryOptions(options)
        setCountry(
          (current) =>
            current ||
            String(
              proxyCountryCode || stationCountry || options[0]?.value || '',
            )
              .trim()
              .toUpperCase(),
        )
      } catch {
      } finally {
        setLoadingCountries(false)
      }
    }

    safeAsync(loadCountries(), 'setup.loadCountries')
  }, [proxyCountryCode, stationCountry])

  const registrationCodeValid = registrationCode.trim().length >= 6

  const adminValid =
    username.trim().length >= 3 &&
    password.trim().length >= 6 &&
    password === confirmPassword

  const registrationDone = registrationSuccess || deviceRegistered
  const siteReady = Boolean(siteProfile) && !needsCountry
  const normalizedCountry = country.trim().toUpperCase()
  const isTanzania = [
    'TZ',
    'TZA',
    'TANZANIA',
    'UNITED REPUBLIC OF TANZANIA',
  ].includes(normalizedCountry)

  useEffect(() => {
    if (step === 'tanzania' && !isTanzania && !loadingCountries) {
      queueMicrotask(() => setStep('country'))
    }
  }, [isTanzania, loadingCountries, step])

  const steps: Array<{ key: SetupStep; label: string; done: boolean }> = [
    { key: 'register', label: 'Device Registration', done: registrationDone },
    { key: 'country', label: 'Site & Country', done: siteReady },
    ...(isTanzania
      ? [
          {
            key: 'tanzania' as SetupStep,
            label: 'Tanzania Fiscal',
            done: false,
          },
        ]
      : []),
    { key: 'admin', label: 'Admin User', done: false },
  ]

  const syncSiteProfile = async () => {
    setSiteSyncing(true)
    setError(null)

    try {
      const res = await fetch('/api/setup/site', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          action: 'sync',
        }),
      })

      const data = await res.json().catch(() => ({}))
      const payload = data?.data ?? data

      if (!res.ok) {
        setError(
          payload?.error?.message ||
            payload?.message ||
            payload?.error ||
            'Site sync failed',
        )
        return
      }

      const profile = payload?.siteProfile ?? null
      setSiteProfile(profile)
      const needs = Boolean(payload?.needsCountry)
      setNeedsCountry(needs)
      const incomingCountry = String(
        payload?.country || profile?.country || country,
      )
        .trim()
        .toUpperCase()
      if (incomingCountry) setCountry(incomingCountry)
      const incomingIsTanzania = [
        'TZ',
        'TZA',
        'TANZANIA',
        'UNITED REPUBLIC OF TANZANIA',
      ].includes(incomingCountry)
      setStep(needs ? 'country' : incomingIsTanzania ? 'tanzania' : 'admin')
    } catch (err: any) {
      setError(err?.message || 'Site sync failed')
    } finally {
      setSiteSyncing(false)
    }
  }

  useEffect(() => {
    const check = async () => {
      if (!csrfToken) return
      const res = await fetch('/api/setup/admin?check=1', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (data?.adminExists) router.replace('/login?setup=complete')
    }
    safeAsync(check(), 'setup.checkAdmin')
  }, [csrfToken, router])

  const handleRegisterDevice = async () => {
    if (!registrationCodeValid) return
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/setup/device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          action: 'register',
          registrationCode: registrationCode.trim(),
          countryCode: country.trim().toUpperCase(),
        }),
      })

      const data = await res.json().catch(() => ({}))
      const payload = data?.data ?? data

      if (!res.ok) {
        setError(
          payload?.error?.message ||
            payload?.message ||
            payload?.error ||
            'Device registration failed',
        )
        return
      }

      setRegistrationSuccess(true)
      setDeviceRegistered(true)
      const returnedCountry = String(
        payload?.countryCode || payload?.countryId || '',
      )
        .trim()
        .toUpperCase()
      if (returnedCountry) setCountry(returnedCountry)
      if (payload?.siteProfile) setSiteProfile(payload.siteProfile)
      if (typeof payload?.needsCountry === 'boolean') {
        setNeedsCountry(Boolean(payload.needsCountry))
      }
      await syncSiteProfile()
    } catch (err: any) {
      setError(err?.message || 'Device registration failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetRegistration = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/setup/device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ csrf_token: csrfToken, action: 'reset' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data?.error?.message ||
            data?.message ||
            data?.error ||
            'Failed to reset registration',
        )
      }
      setDeviceRegistered(false)
      setRegistrationSuccess(false)
      setRegistrationCode('')
      setSiteProfile(null)
      setStep('register')
    } catch (err: any) {
      setError(err?.message || 'Failed to reset registration')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetCountry = async () => {
    if (!country) return
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/setup/site', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          action: 'set-country',
          country: country.trim(),
        }),
      })

      const data = await res.json().catch(() => ({}))
      const payload = data?.data ?? data

      if (!res.ok) {
        setError(
          payload?.error?.message ||
            payload?.message ||
            payload?.error ||
            'Failed to save country',
        )
        return
      }

      if (payload?.siteProfile) setSiteProfile(payload.siteProfile)
      setNeedsCountry(false)
      setStep(country.trim().toUpperCase() === 'TZ' ? 'tanzania' : 'admin')
    } catch (err: any) {
      setError(err?.message || 'Failed to save country')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateAdmin = async () => {
    if (!adminValid) return
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/setup/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          username: username.trim(),
          password: password.trim(),
          email: email.trim() || `administrator@local`,
          fullName: fullName.trim() || 'Administrator',
          deviceRegistered: registrationSuccess || deviceRegistered,
        }),
      })

      const data = await res.json().catch(() => ({}))
      const msg = String(
        data?.error?.message || data?.error || data?.message || '',
      ).trim()

      if (!res.ok) {
        if (msg === 'User already exists') {
          router.replace('/login?setup=complete')
          return
        }
        setError(msg || 'Admin creation failed')
        return
      }

      router.replace('/login?setup=complete')
    } catch (err: any) {
      setError(err?.message || 'Network error creating admin')
    } finally {
      setIsSubmitting(false)
    }
  }

  const showSetupOverlay =
    siteSyncing || (loadingCountries && step === 'country')

  const headerCopy = useMemo(() => {
    if (step === 'register') return 'Register this device with the VPOS cloud'
    if (step === 'country') return 'Confirm site details and country'
    if (step === 'tanzania') return 'Register TRA and EWURA through vpos-proxy'
    return 'Create the administrator account'
  }, [step])

  const recheckProxy = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/setup/proxy-status', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      const payload = json?.data ?? json

      const reachable = Boolean(payload?.proxyReachable)
      setProxyOk(reachable)
      if (!reachable) {
        setError(String(payload?.error || 'Proxy not reachable'))
        return
      }

      // Refresh server-rendered setup state.
      window.location.reload()
    } catch (err: any) {
      setProxyOk(false)
      setError(err?.message || 'Proxy not reachable')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!proxyOk) {
    const configured = String(proxyUrl || 'http://127.0.0.1:5555').trim()
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-[var(--text-primary)]">
            Proxy connection problem
          </CardTitle>
          <CardDescription className="text-sm text-[var(--text-secondary)]">
            The app cannot reach the VPOS Proxy. Setup cannot continue until the
            proxy is running and reachable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-[var(--text-secondary)]">
            <div className="font-medium text-[var(--text-primary)]">
              Configured proxy URL
            </div>
            <div className="break-all">{configured}</div>
            <div className="mt-2 text-xs text-[var(--text-secondary)]">
              Verify the proxy service is running, the host/port is correct, and
              the device can reach it over the network.
            </div>
          </div>
          {error && (
            <ErrorDetails
              title="Connection failed"
              message="We could not reach the proxy service."
              error={error}
            />
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={recheckProxy}
              variant="primary"
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Re-checking…' : 'Re-check connection'}
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="secondary"
              disabled={isSubmitting}
              className="w-full"
            >
              Reload page
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="relative">
      {showSetupOverlay ? (
        <LoadingOverlay
          label={
            siteSyncing ? 'Syncing site details…' : 'Loading setup options…'
          }
        />
      ) : null}
      <CsrfBootstrap onToken={setCsrfToken} />
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-[var(--text-primary)]">
          Device Setup
        </CardTitle>
        <CardDescription className="text-sm text-[var(--text-secondary)]">
          {headerCopy}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress indicator */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((item, index) => {
            const active = step === item.key
            const variant = item.done
              ? STATUS_VARIANT.SUCCESS
              : active
                ? STATUS_VARIANT.INFO
                : STATUS_VARIANT.NEUTRAL
            return (
              <div key={item.key} className="flex items-center gap-2">
                <Badge variant={variant}>{index + 1}</Badge>
                <span className="text-xs text-[var(--text-secondary)]">
                  {item.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Error display */}
        {error && (
          <ErrorDetails
            title="Setup error"
            message="We could not complete this step. Review the details and try again."
            error={error}
          />
        )}

        {/* Step 1: Device Registration */}
        {step === 'register' && (
          <div className="space-y-4">
            {deviceRegistered ? (
              <>
                <Alert variant={STATUS_VARIANT.SUCCESS}>
                  This proxy is already registered. Continue with the current
                  registration or reset it to enter a new registration code.
                </Alert>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={handleResetRegistration}
                    disabled={isSubmitting}
                    variant="destructive"
                    className="w-full"
                  >
                    {isSubmitting ? 'Resetting…' : 'Reset Registration'}
                  </Button>
                  <Button
                    onClick={syncSiteProfile}
                    disabled={siteSyncing}
                    variant="primary"
                    className="w-full"
                  >
                    {siteSyncing ? 'Syncing…' : 'Continue'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <FormField
                  label="Country"
                  helpText="The selected country is stored on vpos-ftc-app and vpos-proxy."
                >
                  <Select
                    id="registrationCountry"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    disabled={loadingCountries}
                  >
                    {countryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label="Registration Code"
                  error={
                    registrationCode && !registrationCodeValid
                      ? 'Registration code must be at least 6 characters'
                      : undefined
                  }
                >
                  <Input
                    id="registrationCode"
                    name="registrationCode"
                    value={registrationCode}
                    onChange={(e) =>
                      setRegistrationCode(e.target.value.toUpperCase())
                    }
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Enter registration code"
                    autoFocus
                  />
                </FormField>
                <Button
                  onClick={handleRegisterDevice}
                  disabled={!registrationCodeValid || !country || isSubmitting}
                  variant="primary"
                  className="w-full"
                >
                  {isSubmitting ? 'Registering...' : 'Register Device'}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step 2: Site/Country */}
        {step === 'country' && (
          <div className="space-y-4">
            {loadingCountries ? (
              <Alert variant={STATUS_VARIANT.INFO}>
                Loading available countries…
              </Alert>
            ) : null}
            {siteProfile?.siteName && (
              <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-[var(--text-secondary)]">
                Site synced:{' '}
                <span className="font-medium">{siteProfile.siteName}</span>
              </div>
            )}

            <div className="space-y-2">
              <FormField
                label="Country"
                helpText="Select the fiscal country for this station to seed the base configuration."
              >
                <Select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {countryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => setStep('register')}
                disabled={isSubmitting || siteSyncing}
                variant="ghost"
                className="w-full"
              >
                Back
              </Button>
              <Button
                onClick={handleSetCountry}
                disabled={!country || isSubmitting}
                variant="primary"
                className="w-full"
              >
                {isSubmitting ? 'Saving...' : 'Save Country'}
              </Button>
              <Button
                onClick={syncSiteProfile}
                disabled={siteSyncing}
                variant="secondary"
                className="w-full"
              >
                {siteSyncing ? 'Refreshing...' : 'Refresh Site Info'}
              </Button>
            </div>
          </div>
        )}

        {/* Tanzania proxy registration */}
        {step === 'tanzania' && (
          <div className="space-y-4">
            <TanzaniaProxyRegistrationClient
              endpoint="/api/setup/tanzania-fiscal"
              compact
              onComplete={() => setStep('admin')}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => setStep('country')}
                variant="ghost"
                className="w-full"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep('admin')}
                variant="secondary"
                className="w-full"
              >
                Continue to Admin
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Admin User */}
        {step === 'admin' && (
          <div className="space-y-4">
            {registrationDone && (
              <Alert variant={STATUS_VARIANT.SUCCESS}>
                Device registered successfully. Complete the administrator
                account to finish setup.
              </Alert>
            )}

            <div className="space-y-2">
              <FormField label="Username">
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username (min 3 characters)"
                  autoFocus
                />
              </FormField>
            </div>

            <div className="space-y-2">
              <FormField label="Password">
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password (min 6 characters)"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </FormField>
            </div>

            <div className="space-y-2">
              <FormField
                label="Confirm Password"
                error={
                  confirmPassword && password !== confirmPassword
                    ? 'Passwords do not match'
                    : undefined
                }
              >
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </FormField>
            </div>

            <div className="space-y-2">
              <FormField label="Email (optional)">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                />
              </FormField>
            </div>

            <div className="space-y-2">
              <FormField label="Full Name (optional)">
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Administrator"
                />
              </FormField>
            </div>

            <Button
              onClick={handleCreateAdmin}
              disabled={!adminValid || isSubmitting || !csrfToken}
              variant="primary"
              className="w-full"
            >
              {isSubmitting
                ? 'Creating Admin...'
                : 'Create Admin & Complete Setup'}
            </Button>

            <Button
              onClick={() =>
                setStep(
                  needsCountry
                    ? 'country'
                    : isTanzania
                      ? 'tanzania'
                      : 'country',
                )
              }
              disabled={isSubmitting}
              variant="ghost"
              className="w-full"
            >
              Back
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default SetupWizard
