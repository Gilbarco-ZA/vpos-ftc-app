'use client'

import type { ToastVariant } from '@/components/ui/toast'
import type {
  ProxyQueueModules,
  ProxySettingsConfig,
  ProxySettingsResponse,
} from '@/src/modules/proxy-settings/application/proxySettings'
import { useMemo, useRef, useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ToastItem, ToastViewport } from '@/components/ui/toast'

const DEFAULT_QUEUE_MODULES = [
  'invoice',
  'credit-note',
  'debit-note',
  'deposit',
  'product',
  'stock-in',
  'stock-out',
  'inventory',
  'validate-tin',
] as const

type ProxySettingsFormProps = {
  initialSettings: ProxySettingsConfig
  runtimeLastUpdated: number | null
  endpointUrl: string | null
}

type ToastState = { message: string; variant: ToastVariant } | null
type BusyAction = 'loading' | 'saving' | null

type ScalarField = Exclude<
  keyof ProxySettingsConfig,
  'countryCode' | 'queueModules'
>

type FormValues = Record<ScalarField, string> & {
  countryCode: string
  queueModules: ProxyQueueModules
}

const toFormValues = (settings: ProxySettingsConfig): FormValues => ({
  cloudApiBase: String(settings.cloudApiBase ?? ''),
  swaggerEndpointCloud: String(settings.swaggerEndpointCloud ?? ''),
  swaggerEndpointInternal: String(settings.swaggerEndpointInternal ?? ''),
  swaggerEndpointTanzania: String(settings.swaggerEndpointTanzania ?? ''),
  healthEndpoint: String(settings.healthEndpoint ?? ''),
  swaggerCacheTimeout: String(settings.swaggerCacheTimeout ?? ''),
  requestTimeout: String(settings.requestTimeout ?? ''),
  rateLimitWindowMs: String(settings.rateLimitWindowMs ?? ''),
  rateLimitMaxRequests: String(settings.rateLimitMaxRequests ?? ''),
  fiscalNif: String(settings.fiscalNif ?? ''),
  fiscalEmissionLogic: String(settings.fiscalEmissionLogic ?? ''),
  fiscalRepositoryId: String(settings.fiscalRepositoryId ?? ''),
  countryCode: String(settings.countryCode ?? '').toUpperCase(),
  queueModules: { ...(settings.queueModules ?? {}) },
})

const extractErrorMessage = (json: unknown, fallback: string) => {
  if (!json || typeof json !== 'object') return fallback
  const payload = json as any
  if (typeof payload.error === 'string') return payload.error
  if (typeof payload.error?.message === 'string') return payload.error.message
  if (typeof payload.message === 'string') return payload.message
  return fallback
}

const toNumber = (value: string) => Number(value.trim())

export const ProxySettingsForm = ({
  initialSettings,
  runtimeLastUpdated: initialRuntimeLastUpdated,
  endpointUrl: initialEndpointUrl,
}: ProxySettingsFormProps) => {
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(initialSettings),
  )
  const [runtimeLastUpdated, setRuntimeLastUpdated] = useState<number | null>(
    initialRuntimeLastUpdated,
  )
  const [endpointUrl, setEndpointUrl] = useState<string | null>(
    initialEndpointUrl,
  )
  const clearTimer = useRef<number | null>(null)

  const runtimeLabel = useMemo(() => {
    if (!runtimeLastUpdated) return 'Runtime config has not reported a refresh.'
    return `Runtime config refreshed ${new Date(runtimeLastUpdated).toLocaleString()}.`
  }, [runtimeLastUpdated])

  const queueModuleKeys = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_QUEUE_MODULES,
          ...Object.keys(values.queueModules),
        ]),
      ),
    [values.queueModules],
  )

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ message, variant })
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  const setField =
    (field: ScalarField) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({
        ...current,
        [field]: event.target.value,
      }))
    }

  const applyResponse = (data: ProxySettingsResponse) => {
    if (data.settings) setValues(toFormValues(data.settings))
    setRuntimeLastUpdated(data.runtimeLastUpdated ?? null)
    if (data.endpointUrl) setEndpointUrl(data.endpointUrl)
  }

  const requestSettings = async (
    method: 'GET' | 'PATCH',
    body?: Record<string, unknown>,
  ) => {
    const response = await fetch('/api/admin/proxy-settings', {
      method,
      cache: 'no-store',
      headers:
        method === 'PATCH'
          ? {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            }
          : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok || json?.ok === false) {
      throw new Error(
        extractErrorMessage(
          json,
          `Failed to ${method === 'GET' ? 'load' : 'save'} proxy settings`,
        ),
      )
    }
    return json.data as ProxySettingsResponse
  }

  const reloadSettings = async () => {
    if (busy) return
    setBusy('loading')
    try {
      applyResponse(await requestSettings('GET'))
      showToast('Settings reloaded from vpos-proxy', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!csrfToken || busy) return

    setBusy('saving')
    try {
      const data = await requestSettings('PATCH', {
        cloudApiBase: values.cloudApiBase.trim(),
        swaggerEndpointCloud: values.swaggerEndpointCloud.trim(),
        swaggerEndpointInternal: values.swaggerEndpointInternal.trim(),
        swaggerEndpointTanzania: values.swaggerEndpointTanzania.trim(),
        healthEndpoint: values.healthEndpoint.trim(),
        swaggerCacheTimeout: toNumber(values.swaggerCacheTimeout),
        requestTimeout: toNumber(values.requestTimeout),
        rateLimitWindowMs: toNumber(values.rateLimitWindowMs),
        rateLimitMaxRequests: toNumber(values.rateLimitMaxRequests),
        fiscalNif: values.fiscalNif.trim(),
        fiscalEmissionLogic: toNumber(values.fiscalEmissionLogic),
        fiscalRepositoryId: values.fiscalRepositoryId.trim(),
        countryCode: values.countryCode.trim().toUpperCase() || null,
        queueModules: values.queueModules,
        csrfToken,
      })

      applyResponse(data)
      showToast('Settings updated in vpos-proxy', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null

  return (
    <>
      {toast ? (
        <ToastViewport>
          <ToastItem variant={toast.variant}>{toast.message}</ToastItem>
        </ToastViewport>
      ) : null}

      <CsrfBootstrap onToken={setCsrfToken} />

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>VPOS proxy connection</CardTitle>
                <CardDescription>{runtimeLabel}</CardDescription>
                <p className="break-all text-xs text-[var(--text-muted)]">
                  {endpointUrl ?? 'Proxy endpoint unavailable'}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={reloadSettings}
                disabled={disabled}
              >
                {busy === 'loading' ? 'Reloading…' : 'Reload from vpos-proxy'}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>VPOS Cloud API Configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <FormField
              label="Cloud API base URL"
              helpText="Absolute URL for the VPOS cloud API."
              required
            >
              <Input
                value={values.cloudApiBase}
                onChange={setField('cloudApiBase')}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Cloud swagger endpoint"
              helpText="Default: /swagger/ppx/swagger.json"
              required
            >
              <Input
                value={values.swaggerEndpointCloud}
                onChange={setField('swaggerEndpointCloud')}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Internal swagger endpoint"
              helpText="Default: /swagger/internal/swagger.json"
              required
            >
              <Input
                value={values.swaggerEndpointInternal}
                onChange={setField('swaggerEndpointInternal')}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Tanzania swagger endpoint"
              helpText="Default: /swagger/tanzania/swagger.json. Fetched from the configured Cloud API base URL."
              required
            >
              <Input
                value={values.swaggerEndpointTanzania}
                onChange={setField('swaggerEndpointTanzania')}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Health endpoint"
              helpText="Default: /api/ping"
              required
            >
              <Input
                value={values.healthEndpoint}
                onChange={setField('healthEndpoint')}
                disabled={disabled}
                required
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeouts and rate limiting</CardTitle>
            <CardDescription>
              Values are persisted by vpos-proxy in milliseconds.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <FormField
              label="Swagger cache timeout"
              helpText="Default: 604800000 ms (7 days)."
              required
            >
              <Input
                type="number"
                min={1}
                step={1}
                value={values.swaggerCacheTimeout}
                onChange={setField('swaggerCacheTimeout')}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Request timeout"
              helpText="Default: 30000 ms (30 seconds)."
              required
            >
              <Input
                type="number"
                min={1}
                step={1}
                value={values.requestTimeout}
                onChange={setField('requestTimeout')}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Rate limit window"
              helpText="Default: 900000 ms (15 minutes). Use 0 to disable."
              required
            >
              <Input
                type="number"
                min={0}
                step={1}
                value={values.rateLimitWindowMs}
                onChange={setField('rateLimitWindowMs')}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Max requests"
              helpText="Default: 1000 requests per window. Use 0 to disable."
              required
            >
              <Input
                type="number"
                min={0}
                step={1}
                value={values.rateLimitMaxRequests}
                onChange={setField('rateLimitMaxRequests')}
                disabled={disabled}
                required
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fiscal configuration</CardTitle>
            <CardDescription>
              Country and IUD values applied by vpos-proxy.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-4">
            <FormField
              label="Country code"
              helpText="Proxy country code, for example KE or TZ."
            >
              <Input
                value={values.countryCode}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    countryCode: event.target.value.toUpperCase(),
                  }))
                }
                maxLength={3}
                placeholder="KE"
                disabled={disabled}
              />
            </FormField>
            <FormField
              label="Fiscal NIF"
              helpText="One to nine digits."
              required
            >
              <Input
                value={values.fiscalNif}
                onChange={setField('fiscalNif')}
                inputMode="numeric"
                pattern="[0-9]{1,9}"
                maxLength={9}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Fiscal emission logic"
              helpText="Integer from 0 to 99999."
              required
            >
              <Input
                type="number"
                min={0}
                max={99999}
                step={1}
                value={values.fiscalEmissionLogic}
                onChange={setField('fiscalEmissionLogic')}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField
              label="Fiscal repository ID"
              helpText="Proxy fiscal repository identifier."
              required
            >
              <Input
                value={values.fiscalRepositoryId}
                onChange={setField('fiscalRepositoryId')}
                inputMode="numeric"
                disabled={disabled}
                required
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Queue modules</CardTitle>
            <CardDescription>
              Enable or disable each vpos-proxy document queue.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queueModuleKeys.map((moduleName) => (
              <label
                key={moduleName}
                className="flex items-center gap-3 rounded-md border border-[var(--border-default)] p-3 text-sm"
              >
                <Checkbox
                  checked={values.queueModules[moduleName] === true}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      queueModules: {
                        ...current.queueModules,
                        [moduleName]: event.target.checked,
                      },
                    }))
                  }
                  disabled={disabled}
                />
                <span>{moduleName}</span>
              </label>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={reloadSettings}
            disabled={disabled}
          >
            Reload
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || !csrfToken}
          >
            {busy === 'saving' ? 'Saving…' : 'Save to vpos-proxy'}
          </Button>
        </div>
      </form>
    </>
  )
}
