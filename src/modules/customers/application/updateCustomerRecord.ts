import { fail, notFound } from '@/src/platform/web/api/response'
import { customerUpdateSchema } from '@/src/shared/validations'

import {
  getCustomerForStationRepo,
  updateCustomerRepo,
} from '@/src/modules/customers/infrastructure/customersRepo'

const normalizeOptional = (value: unknown) => {
  if (value === undefined || value === null) return undefined
  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : undefined
}

const normalizeTin = (value: unknown) => {
  const raw = normalizeOptional(value)
  return raw ? raw.toUpperCase() : undefined
}

export async function updateCustomerRecord(params: {
  stationId: string
  customerId: string
  body: Record<string, any>
}) {
  const customerId = String(params.customerId || '').trim()
  if (!customerId) return fail('Customer id is required', 400)

  const existing = await getCustomerForStationRepo({
    stationId: params.stationId,
    customerId,
  })
  if (!existing) return notFound('Not found')

  const parsed = customerUpdateSchema.safeParse({
    tin: params.body.tin,
    buyerName: params.body.buyerName,
    buyerType: params.body.buyerType,
    pin: params.body.pin,
    passportNumber: params.body.passportNumber,
    businessName: params.body.businessName,
    taxNinbrn: params.body.taxNinbrn,
    contactPhone: params.body.contactPhone,
    contactMobile: params.body.contactMobile,
    contactFax: params.body.contactFax,
    contactEmail: params.body.contactEmail,
    contactWebsite: params.body.contactWebsite,
    contactPerson: params.body.contactPerson,
    addressStreet: params.body.addressStreet,
    addressCity: params.body.addressCity,
    addressState: params.body.addressState,
    addressProvince: params.body.addressProvince,
    addressPostalCode: params.body.addressPostalCode,
    addressCountryCode: params.body.addressCountryCode,
    country: params.body.country,
    odometer: params.body.odometer,
    vehicleRegNr: params.body.vehicleRegNr,
    paymentType: params.body.paymentType,
  })

  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }

  const data = parsed.data
  await updateCustomerRepo({
    stationId: params.stationId,
    customerId,
    values: {
      ...data,
      tin: normalizeTin(data.tin),
      buyerName: normalizeOptional(data.buyerName),
      buyerType: normalizeOptional(data.buyerType),
      pin: normalizeOptional(data.pin),
      passportNumber: normalizeOptional(data.passportNumber),
      businessName: normalizeOptional(data.businessName),
      taxNinbrn: normalizeOptional(data.taxNinbrn),
      contactPhone: normalizeOptional(data.contactPhone),
      contactMobile: normalizeOptional(data.contactMobile),
      contactFax: normalizeOptional(data.contactFax),
      contactEmail: normalizeOptional(data.contactEmail),
      contactWebsite: normalizeOptional(data.contactWebsite),
      contactPerson: normalizeOptional(data.contactPerson),
      addressStreet: normalizeOptional(data.addressStreet),
      addressCity: normalizeOptional(data.addressCity),
      addressState: normalizeOptional(data.addressState),
      addressProvince: normalizeOptional(data.addressProvince),
      addressPostalCode: normalizeOptional(data.addressPostalCode),
      addressCountryCode: normalizeOptional(data.addressCountryCode),
      country: normalizeOptional(data.country),
      odometer: normalizeOptional(data.odometer),
      vehicleRegNr: normalizeOptional(data.vehicleRegNr),
      paymentType: normalizeOptional(data.paymentType),
    },
  })

  return getCustomerForStationRepo({ stationId: params.stationId, customerId })
}
