'use client'

import type { ToastVariant } from '@/components/ui/toast'
import type {
  ProxySettingsConfig,
  ProxySettingsResponse,
} from '@/src/modules/proxy-settings/application/proxySettings'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
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
import { ToastItem, ToastViewport } from '@/components/ui/toast'

type ProxySettingsFormProps = {
  initialSettings: ProxySettingsConfig
  runtimeLastUpdated: number | null
}

type ToastState = { message: string; variant: ToastVariant } | null
type FormValues = Record<keyof ProxySettingsConfig, string>

const toFormValues = (settings: ProxySettingsConfig): FormValues => ({
  cloudApiBase: String(settings.cloudApiBase ?? ''),
  swaggerEndpointCloud: String(settings.swaggerEndpointCloud ?? ''),
  swaggerEndpointInternal: String(settings.swaggerEndpointInternal ?? ''),
  healthEndpoint: String(settings.healthEndpoint ?? ''),
  swaggerCacheTimeout: String(settings.swaggerCacheTimeout ?? ''),
  requestTimeout: String(settings.requestTimeout ?? ''),
  rateLimitWindowMs: String(settings.rateLimitWindowMs ?? ''),
  rateLimitMaxRequests: String(settings.rateLimitMaxRequests ?? ''),
  fiscalNif: String(settings.fiscalNif ?? ''),
  fiscalEmissionLogic: String(settings.fiscalEmissionLogic ?? ''),
  fiscalRepositoryId: String(settings.fiscalRepositoryId ?? ''),
})

const extractErrorMessage = (json: any, fallback: string) => {
  if (typeof json?.error === 'string') return json.error
  if (typeof json?.error?.message === 'string') return json.error.message
  if (typeof json?.message === 'string') return json.message
  return fallback
}

export const ProxySettingsForm = ({
  initialSettings,
  runtimeLastUpdated,
}: ProxySettingsFormProps) => {
  const router = useRouter()
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(initialSettings),
  )
  const clearTimer = useRef<number | null>(null)

  const runtimeLabel = useMemo(() => {
    if (!runtimeLastUpdated) return 'Runtime config has not reported a refresh.'
    return `Runtime config refreshed ${new Date(runtimeLastUpdated).toLocaleString()}.`
  }, [runtimeLastUpdated])

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ message, variant })
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  const setField =
    (field: keyof ProxySettingsConfig) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({
        ...current,
        [field]: event.target.value,
      }))
    }

  const applyResponse = (data: ProxySettingsResponse) => {
    if (data?.settings) {
      setValues(toFormValues(data.settings))
    }
  }

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!csrfToken || busy) return

    setBusy(true)
    try {
      const res = await fetch('/api/admin/proxy-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          ...values,
          csrfToken,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          extractErrorMessage(json, 'Failed to save proxy settings'),
        )
      }

      applyResponse(json.data)
      showToast('Proxy settings saved', 'success')
      router.refresh()
    } catch (err: any) {
      showToast(err?.message ?? String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

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
            <CardTitle>VPOS Cloud API Configuration</CardTitle>
            <CardDescription>{runtimeLabel}</CardDescription>
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
                placeholder="http://ec2-13-246-19-190.af-south-1.compute.amazonaws.com"
                disabled={busy}
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
                placeholder="/swagger/ppx/swagger.json"
                disabled={busy}
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
                placeholder="/swagger/internal/swagger.json"
                disabled={busy}
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
                placeholder="/api/ping"
                disabled={busy}
                required
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeouts</CardTitle>
            <CardDescription>
              Values are stored in milliseconds in the vpos-proxy database.
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
                disabled={busy}
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
                disabled={busy}
                required
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rate Limiting</CardTitle>
            <CardDescription>
              Configure the proxy request window and maximum request count.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <FormField
              label="Rate limit window"
              helpText="Default: 900000 ms (15 minutes). Set 0 only when the proxy should disable the window."
              required
            >
              <Input
                type="number"
                min={0}
                step={1}
                value={values.rateLimitWindowMs}
                onChange={setField('rateLimitWindowMs')}
                disabled={busy}
                required
              />
            </FormField>
            <FormField
              label="Max requests"
              helpText="Default: 1000 requests per window."
              required
            >
              <Input
                type="number"
                min={0}
                step={1}
                value={values.rateLimitMaxRequests}
                onChange={setField('rateLimitMaxRequests')}
                disabled={busy}
                required
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>IUD Configuration</CardTitle>
            <CardDescription>
              Configure fiscal identifier generation values used by vpos-proxy.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-3">
            <FormField
              label="Fiscal NIF"
              helpText="One to nine digits. Default: 282948309."
              required
            >
              <Input
                value={values.fiscalNif}
                onChange={setField('fiscalNif')}
                inputMode="numeric"
                pattern="[0-9]{1,9}"
                maxLength={9}
                disabled={busy}
                required
              />
            </FormField>
            <FormField
              label="Fiscal emission logic"
              helpText="Integer from 0 to 99999. Default: 24."
              required
            >
              <Input
                type="number"
                min={0}
                max={99999}
                step={1}
                value={values.fiscalEmissionLogic}
                onChange={setField('fiscalEmissionLogic')}
                disabled={busy}
                required
              />
            </FormField>
            <FormField
              label="Fiscal repository ID"
              helpText="Exactly one digit. Default: 1."
              required
            >
              <Input
                value={values.fiscalRepositoryId}
                onChange={setField('fiscalRepositoryId')}
                inputMode="numeric"
                pattern="[0-9]"
                maxLength={1}
                disabled={busy}
                required
              />
            </FormField>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy || !csrfToken}>
            {busy ? 'Saving...' : 'Save proxy settings'}
          </Button>
        </div>
      </form>
    </>
  )
}
