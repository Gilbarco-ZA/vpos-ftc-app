import { NextResponse } from 'next/server'

import { getAdminPluginCatalogStatus } from '@/src/modules/admin-config/application/getAdminPluginCatalogStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Legacy vpos-app endpoint: GET /plugins/status
 *
 * vpos-app returned both:
 * - plugins: plugin verification status (runtime-specific)
 * - registeredPlugins: full catalog list
 *
 * In vpos-ftc-app, plugin verification is station/config dependent and may include secrets.
 * This endpoint intentionally returns a safe subset:
 * - plugins: {} (placeholder for legacy shape compatibility)
 * - registeredPlugins: plugin catalog entries
 */
export async function GET() {
  return NextResponse.json(await getAdminPluginCatalogStatus())
}
