import { fail } from '@/src/platform/web/api/response'
import { auditCustomerCreated } from '@/src/shared/audit/log'
import { customerCreateSchema } from '@/src/shared/validations'

import {
  createOrUpdateCustomerRepo,
  getCustomerForStationRepo,
} from '@/src/modules/customers/infrastructure/customersRepo'

export async function createCustomerRecord(params: {
  stationId: string
  userId: string
  stationCountry?: string | null
  body: Record<string, any>
}) {
  const parsed = customerCreateSchema.safeParse({
    tin: params.body.tin,
    buyerName: params.body.buyerName,
    buyerType: params.body.buyerType,
    pin: params.body.pin,
    passportNumber: params.body.passportNumber,
    businessName: params.body.businessName,
    taxNinbrn: params.body.taxNinbrn,
    addressStreet: params.body.addressStreet,
    addressCity: params.body.addressCity,
    addressState: params.body.addressState,
    addressProvince: params.body.addressProvince,
    addressPostalCode: params.body.addressPostalCode,
    addressCountryCode: params.body.addressCountryCode,
    contactPhone: params.body.contactPhone,
    contactMobile: params.body.contactMobile,
    contactFax: params.body.contactFax,
    contactEmail: params.body.contactEmail,
    contactWebsite: params.body.contactWebsite,
    contactPerson: params.body.contactPerson,
    country: params.body.country,
    odometer: params.body.odometer,
    vehicleRegNr: params.body.vehicleRegNr,
    paymentType: params.body.paymentType,
  })

  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }

  const data = parsed.data
  const stationCountry = String(params.stationCountry || 'TZ')
    .trim()
    .toUpperCase()
  const normalizedCountry = String(data.country || stationCountry)
    .trim()
    .toUpperCase()
  const normalizedAddressCountryCode = String(
    data.addressCountryCode || stationCountry,
  )
    .trim()
    .toUpperCase()
  const normalizedTin = String(data.tin || '')
    .trim()
    .toUpperCase()
  const normalizedBuyer = String(data.buyerName || '').trim()
  const normalizedPin = String(
    data.pin || (stationCountry === 'KE' ? normalizedTin : ''),
  ).trim()

  if (!normalizedTin) return fail('TIN is required', 400)
  if (!normalizedBuyer) return fail('Buyer name is required', 400)

  const customerId = await createOrUpdateCustomerRepo({
    stationId: params.stationId,
    data: {
      ...data,
      tin: normalizedTin,
      buyerName: normalizedBuyer,
      pin: normalizedPin || undefined,
      country: normalizedCountry,
      addressCountryCode: normalizedAddressCountryCode,
    },
  })

  await auditCustomerCreated(params.stationId, params.userId, customerId, {
    tin: normalizedTin,
    buyerName: normalizedBuyer,
  }).catch(() => {})

  const customer = await getCustomerForStationRepo({
    stationId: params.stationId,
    customerId,
  })

  return {
    customerId,
    searchTin: normalizedTin,
    customer,
  }
}
