import type { SessionUser } from '@/src/shared/types'
import { NextRequest, NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { assertStationIsTanzania } from '@/src/modules/tanzania-fiscal/application/country'
import { submitTanzaniaProxyRegistration } from '@/src/modules/tanzania-fiscal/application/proxyRegistration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const text = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value.trim() : ''

/**
 * Backward-compatible TRA registration endpoint.
 *
 * Direct TRA calls and local certificate signing are retired. The legacy form
 * is translated into a JSON request and submitted through vpos-proxy, which in
 * turn delegates registration to the licensed cloud fiscal middleware.
 */
export const POST = async (req: NextRequest) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    await assertStationIsTanzania(user.stationId)

    const form = await req.formData()
    const certificate = form.get('certificate')
    const payload: Record<string, unknown> = {
      registrationType: 'TRA',
      tin: text(form.get('tin')) || text(form.get('taxIdNo')),
      serialNumber: text(form.get('serialNumber')),
      certSerial: text(form.get('certSerial')),
      privateKeyBase64: text(form.get('privateKeyBase64')),
      publicKeyBase64: text(form.get('publicKeyBase64')),
      password: text(form.get('password')),
      licenseKey: text(form.get('licenseKey')) || text(form.get('certKey')),
      certificatePassphrase:
        text(form.get('certificatePassphrase')) || text(form.get('passphrase')),
    }

    if (certificate instanceof File && certificate.size > 0) {
      payload.certificateBase64 = Buffer.from(
        await certificate.arrayBuffer(),
      ).toString('base64')
    }

    const data = await submitTanzaniaProxyRegistration(user.stationId, payload)
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return await serverError(error, { req, stationId: user?.stationId })
  }
}
