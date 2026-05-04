import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import {
  extractProxySettingsPayload,
  getProxySettingsErrorMessage,
  getProxySettingsViaProxy,
} from '@/src/modules/proxy-settings/application/proxySettings'

import { PageHeader } from '@/components/layout/page-header'
import { ErrorDetails } from '@/components/ui/error-details'

import { ProxySettingsForm } from './ProxySettingsForm'

export const dynamic = 'force-dynamic'

const ProxySettingsPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  const result = await getProxySettingsViaProxy(user.stationId)
  const payload = result.ok ? extractProxySettingsPayload(result.data) : null
  const loadError = result.ok
    ? null
    : {
        status: result.status,
        message: getProxySettingsErrorMessage(result.data),
        body: result.data,
      }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Proxy settings"
        description="Manage vpos-proxy cloud API, timeout, rate limit, and IUD configuration."
      />

      {loadError ? (
        <ErrorDetails
          title="Unable to load proxy settings"
          message="Check that vpos-proxy is running and reachable."
          error={loadError}
        />
      ) : null}

      {payload?.settings ? (
        <ProxySettingsForm
          initialSettings={payload.settings}
          runtimeLastUpdated={payload.runtimeLastUpdated ?? null}
        />
      ) : null}
    </div>
  )
}

export default ProxySettingsPage
