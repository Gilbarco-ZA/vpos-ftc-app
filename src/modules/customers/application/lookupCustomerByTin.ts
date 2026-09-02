import { queryOne } from '@/src/platform/db/postgres'

import { mapCustomerRow } from '../infrastructure/customersRepo'

export async function lookupCustomerByTin(input: {
  stationId: string
  tin: string
}) {
  const customer = await queryOne<Record<string, unknown>>(
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
    [input.tin, input.stationId],
  )
  return customer ? mapCustomerRow(customer) : null
}
