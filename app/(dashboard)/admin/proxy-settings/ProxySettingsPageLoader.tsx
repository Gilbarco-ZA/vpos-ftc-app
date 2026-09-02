'use client'

import type { ProxySettingsResponse } from '@/src/modules/proxy-settings/application/proxySettings'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { ErrorDetails } from '@/components/ui/error-details'
import { PageSkeleton } from '@/components/ui/page-skeleton'

import { ProxySettingsForm } from './ProxySettingsForm'

export function ProxySettingsPageLoader() {
  const [data, setData] = useState<ProxySettingsResponse | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch('/api/admin/proxy-settings', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || body?.ok === false) {
          throw new Error(
            body?.error?.message || 'Unable to load proxy settings',
          )
        }
        setData(body.data)
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason)
      }
    })()

    return () => controller.abort()
  }, [])

  if (!data && !error) return <PageSkeleton rows={6} />

  return (
    <div className="space-y-4">
      <PageHeader
        title="Proxy settings"
        description="Read and update the live vpos-proxy configuration on the DOMS host."
      />
      {error ? (
        <ErrorDetails
          title="Unable to load proxy settings"
          message="Check that vpos-proxy is running and reachable."
          error={error}
        />
      ) : null}
      {data?.settings ? (
        <ProxySettingsForm
          initialSettings={data.settings}
          runtimeLastUpdated={data.runtimeLastUpdated ?? null}
          endpointUrl={data.endpointUrl ?? null}
        />
      ) : null}
    </div>
  )
}
