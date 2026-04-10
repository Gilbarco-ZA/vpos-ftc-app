import type { SessionUser } from '@/src/shared/types'

import { queryOne as pgOne } from '@/src/platform/db/postgres'
import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { mapCustomerRow } from '@/src/modules/customers/infrastructure/customersRepo'

export const dynamic = 'force-dynamic'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const { searchParams } = new URL(req.url)
    const tin = (searchParams.get('tin') || '').trim().toUpperCase()
    const stationIdParam = (searchParams.get('station_id') || '').trim()
    const stationId =
      stationIdParam && stationIdParam === user.stationId
        ? stationIdParam
        : user.stationId

    if (!tin) return fail('TIN is required', 400)

    const customer = await pgOne<any>(
      `
			SELECT c.id, c.tin, c.buyer_name, c.buyer_type, c.pin, c.passport_number,
			       c.business_name, c.tax_ninbrn, c.contact_phone, c.contact_mobile,
			       c.contact_fax, c.contact_email, c.contact_website, c.contact_person,
			       c.address_street, c.address_city, c.address_state, c.address_province,
			       c.address_postal_code, c.address_country_code, c.country,
			       c.odometer, c.vehicle_reg_nr, c.payment_type
			FROM customers c
			LEFT JOIN customer_stations cs ON cs.customer_id = c.id AND cs.station_id = $2
			WHERE UPPER(c.tin) = $1 AND c.deleted_at IS NULL
			ORDER BY cs.last_seen_at DESC NULLS LAST, c.id DESC
			LIMIT 1
			`,
      [tin, stationId],
    )

    if (!customer) return ok({ customer: null })

    return ok({
      customer: mapCustomerRow(customer),
    })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
