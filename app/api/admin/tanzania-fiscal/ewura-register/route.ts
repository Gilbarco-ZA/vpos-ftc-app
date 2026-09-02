import type { SessionUser } from '@/src/shared/types'
import { NextRequest, NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { assertStationIsTanzania } from '@/src/modules/tanzania-fiscal/application/country'
import { submitTanzaniaProxyRegistration } from '@/src/modules/tanzania-fiscal/application/proxyRegistration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AnyRecord = Record<string, any>

const stringValue = (...values: unknown[]) =>
  values.map((value) => String(value ?? '').trim()).find(Boolean) || ''

/**
 * Backward-compatible EWURA registration endpoint. All network traffic is
 * submitted through vpos-proxy; vpos-ftc-app no longer calls EWURA directly.
 */
export const POST = async (req: NextRequest) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    await assertStationIsTanzania(user.stationId)

    const input = (await req.json().catch(() => ({}))) as AnyRecord
    const payload: AnyRecord = {
      ...input,
      registrationType: 'EWURA',
      apiSourceId: stringValue(input.apiSourceId, input.APISourceId),
      retailStationName: stringValue(
        input.retailStationName,
        input.RetailStationName,
      ),
      ewuraLicenseNo: stringValue(input.ewuraLicenseNo, input.EWURALicenseNo),
      operatorTin: stringValue(input.operatorTin, input.OperatorTin),
      operatorVrn: stringValue(input.operatorVrn, input.OperatorVrn),
      operatorName: stringValue(input.operatorName, input.OperatorName),
      licenseeTraSerialNo: stringValue(
        input.licenseeTraSerialNo,
        input.LicenseeTraSerialNo,
      ),
      regionName: stringValue(input.regionName, input.RegionName),
      districtName: stringValue(input.districtName, input.DistrictName),
      wardName: stringValue(input.wardName, input.WardName),
      zone: stringValue(input.zone, input.Zone),
      contactEmail: stringValue(
        input.contactEmail,
        input.ContactPersonEmailAddress,
      ),
      contactPhone: stringValue(input.contactPhone, input.ContactPersonPhone),
    }

    const data = await submitTanzaniaProxyRegistration(user.stationId, payload)
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return await serverError(error, { req, stationId: user?.stationId })
  }
}
