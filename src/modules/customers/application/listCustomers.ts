import type { CustomerListResult } from '@/src/modules/customers/application/customerTypes'

import { listCustomersRepo } from '@/src/modules/customers/infrastructure/customersRepo'

export async function listCustomers(params: {
  stationId: string
  q?: string
  country?: string
  buyerType?: string
  includeDeleted?: boolean
  page?: number
  pageSize?: number
}): Promise<CustomerListResult> {
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.min(100, Math.max(10, Number(params.pageSize || 20)))
  const { rows, total } = await listCustomersRepo({
    stationId: params.stationId,
    q: (params.q || '').trim() || undefined,
    country: (params.country || '').trim() || undefined,
    buyerType: (params.buyerType || '').trim() || undefined,
    includeDeleted: Boolean(params.includeDeleted),
    page,
    pageSize,
  })

  return {
    rows: rows.map((row) => ({
      id: String(row.id),
      buyerName: row.buyer_name,
      tin: row.tin,
      buyerType: row.buyer_type,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      contactMobile: row.contact_mobile,
      country: row.country,
      odometer: row.odometer,
      vehicleRegNr: row.vehicle_reg_nr,
      paymentType: row.payment_type,
      lastSeenAt: row.last_seen_at,
      deletedAt: row.deleted_at,
    })),
    page,
    pageSize,
    total,
  }
}
