'use client'

import { useEffect } from 'react'
import { z } from 'zod'

import { useForm } from '@/src/shared/hooks/useForm'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

export type CustomerFormData = {
  id?: string
  buyerName: string
  tin: string
  buyerType?: string
  pin?: string
  passportNumber?: string
  businessName?: string
  taxNinbrn?: string
  contactPerson?: string
  contactPhone?: string
  contactMobile?: string
  contactFax?: string
  contactEmail?: string
  contactWebsite?: string
  addressStreet?: string
  addressCity?: string
  addressState?: string
  addressProvince?: string
  addressPostalCode?: string
  addressCountryCode?: string
  country?: string
  odometer?: string
  vehicleRegNr?: string
  paymentType?: 'CASH' | 'CARD' | ''
}

type CustomerDrawerProps = {
  open: boolean
  mode: 'create' | 'edit'
  customer?: CustomerFormData | null
  stationCountry?: string | null
  onOpenChange: (open: boolean) => void
  onSaved?: (customer: any) => void
}

const emptyForm: CustomerFormData = {
  buyerName: '',
  tin: '',
  buyerType: '',
  pin: '',
  passportNumber: '',
  businessName: '',
  taxNinbrn: '',
  contactPerson: '',
  contactPhone: '',
  contactMobile: '',
  contactFax: '',
  contactEmail: '',
  contactWebsite: '',
  addressStreet: '',
  addressCity: '',
  addressState: '',
  addressProvince: '',
  addressPostalCode: '',
  addressCountryCode: '',
  country: '',
  odometer: '',
  vehicleRegNr: '',
  paymentType: 'CASH',
}

const normalize = (value?: string) => {
  const trimmed = String(value ?? '').trim()
  return trimmed.length ? trimmed : undefined
}

const isKenyaStation = (country?: string | null) =>
  String(country || '')
    .trim()
    .toUpperCase() === 'KE'

const customerSchema = z
  .object({
    buyerName: z.string().trim().min(1, 'Buyer name is required'),
    tin: z.string().trim().min(1, 'TIN is required'),
    country: z.string().trim().optional(),
    addressCountryCode: z.string().trim().optional(),
  })
  .passthrough()

export const CustomerDrawer = ({
  open,
  mode,
  customer,
  stationCountry,
  onOpenChange,
  onSaved,
}: CustomerDrawerProps) => {
  const {
    form,
    setField,
    fieldErrors,
    isSubmitting,
    csrfToken,
    setCsrfToken,
    handleSubmit,
    reset,
  } = useForm<CustomerFormData>({
    initial: emptyForm,
    schema: customerSchema,
    onSubmit: async (data, csrf) => {
      const payload = {
        csrf_token: csrf,
        buyerName: normalize(data.buyerName),
        tin: normalize(data.tin)?.toUpperCase(),
        buyerType: normalize(data.buyerType),
        pin: normalize(data.pin),
        passportNumber: normalize(data.passportNumber),
        businessName: normalize(data.businessName),
        taxNinbrn: normalize(data.taxNinbrn),
        contactPerson: normalize(data.contactPerson),
        contactPhone: normalize(data.contactPhone),
        contactMobile: normalize(data.contactMobile),
        contactFax: normalize(data.contactFax),
        contactEmail: normalize(data.contactEmail),
        contactWebsite: normalize(data.contactWebsite),
        addressStreet: normalize(data.addressStreet),
        addressCity: normalize(data.addressCity),
        addressState: normalize(data.addressState),
        addressProvince: normalize(data.addressProvince),
        addressPostalCode: normalize(data.addressPostalCode),
        addressCountryCode: normalize(data.addressCountryCode),
        country: normalize(data.country),
        odometer: normalize(data.odometer),
        vehicleRegNr: normalize(data.vehicleRegNr),
        paymentType: normalize(data.paymentType),
      }

      const res = await fetch(
        mode === 'create' ? '/api/customers' : `/api/customers/${customer?.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf,
          },
          body: JSON.stringify(payload),
        },
      )

      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        throw res.ok ? body : { status: res.status, body }
      }

      onSaved?.(body?.data ?? body)
      onOpenChange(false)
    },
  })

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && customer) {
      reset({ ...emptyForm, ...customer })
    } else {
      reset()
    }
  }, [open, mode, customer, reset])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[95vw] max-w-xl">
        <CsrfBootstrap onToken={setCsrfToken} />
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>
              {mode === 'create' ? 'Add customer' : 'Edit customer'}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex-1 space-y-6 overflow-y-auto pr-2">
            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                Identity
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  label="Buyer name"
                  required
                  error={fieldErrors.buyerName}
                >
                  <Input
                    value={form.buyerName}
                    onChange={(e) => setField('buyerName', e.target.value)}
                    placeholder="Buyer name"
                  />
                </FormField>
                <FormField label="TIN" required error={fieldErrors.tin}>
                  <Input
                    value={form.tin}
                    onChange={(e) => {
                      const nextTin = e.target.value.toUpperCase()
                      setField('tin', nextTin)
                      if (mode === 'create' && isKenyaStation(stationCountry)) {
                        setField('pin', nextTin)
                      }
                    }}
                    placeholder="Tax identification number"
                  />
                </FormField>
                <FormField label="Buyer type">
                  <Select
                    value={form.buyerType || ''}
                    onChange={(e) => setField('buyerType', e.target.value)}
                  >
                    <option value="">Select buyer type</option>
                    <option value="B2C">B2C</option>
                    <option value="B2B">B2B</option>
                    <option value="GOV">Government</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </FormField>
                <FormField label="Business name">
                  <Input
                    value={form.businessName}
                    onChange={(e) => setField('businessName', e.target.value)}
                    placeholder="Business name"
                  />
                </FormField>
                <FormField label="PIN">
                  <Input
                    value={form.pin}
                    onChange={(e) => setField('pin', e.target.value)}
                    placeholder="PIN"
                  />
                </FormField>
                <FormField label="Passport number">
                  <Input
                    value={form.passportNumber}
                    onChange={(e) => setField('passportNumber', e.target.value)}
                    placeholder="Passport number"
                  />
                </FormField>
                <FormField label="Tax NIN/BRN">
                  <Input
                    value={form.taxNinbrn}
                    onChange={(e) => setField('taxNinbrn', e.target.value)}
                    placeholder="Tax NIN/BRN"
                  />
                </FormField>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                Vehicle & payment defaults
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Odometer">
                  <Input
                    value={form.odometer || ''}
                    onChange={(e) => setField('odometer', e.target.value)}
                    placeholder="50000"
                  />
                </FormField>
                <FormField label="Vehicle reg no.">
                  <Input
                    value={form.vehicleRegNr || ''}
                    onChange={(e) => setField('vehicleRegNr', e.target.value)}
                    placeholder="T123 ABC"
                  />
                </FormField>
                <FormField label="Payment type">
                  <Select
                    value={form.paymentType || 'CASH'}
                    onChange={(e) =>
                      setField('paymentType', e.target.value as 'CASH' | 'CARD')
                    }
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                  </Select>
                </FormField>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                Contact
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Contact person">
                  <Input
                    value={form.contactPerson}
                    onChange={(e) => setField('contactPerson', e.target.value)}
                    placeholder="Contact person"
                  />
                </FormField>
                <FormField label="Contact phone">
                  <Input
                    value={form.contactPhone}
                    onChange={(e) => setField('contactPhone', e.target.value)}
                    placeholder="Contact phone"
                  />
                </FormField>
                <FormField label="Mobile">
                  <Input
                    value={form.contactMobile}
                    onChange={(e) => setField('contactMobile', e.target.value)}
                    placeholder="Mobile"
                  />
                </FormField>
                <FormField label="Fax">
                  <Input
                    value={form.contactFax}
                    onChange={(e) => setField('contactFax', e.target.value)}
                    placeholder="Fax"
                  />
                </FormField>
                <FormField label="Email">
                  <Input
                    value={form.contactEmail}
                    onChange={(e) => setField('contactEmail', e.target.value)}
                    placeholder="Email"
                  />
                </FormField>
                <FormField label="Website">
                  <Input
                    value={form.contactWebsite}
                    onChange={(e) => setField('contactWebsite', e.target.value)}
                    placeholder="Website"
                  />
                </FormField>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                Address
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Street" className="sm:col-span-2">
                  <Textarea
                    rows={2}
                    value={form.addressStreet}
                    onChange={(e) => setField('addressStreet', e.target.value)}
                    placeholder="Street"
                  />
                </FormField>
                <FormField label="City">
                  <Input
                    value={form.addressCity}
                    onChange={(e) => setField('addressCity', e.target.value)}
                    placeholder="City"
                  />
                </FormField>
                <FormField label="State">
                  <Input
                    value={form.addressState}
                    onChange={(e) => setField('addressState', e.target.value)}
                    placeholder="State"
                  />
                </FormField>
                <FormField label="Province">
                  <Input
                    value={form.addressProvince}
                    onChange={(e) =>
                      setField('addressProvince', e.target.value)
                    }
                    placeholder="Province"
                  />
                </FormField>
                <FormField label="Postal code">
                  <Input
                    value={form.addressPostalCode}
                    onChange={(e) =>
                      setField('addressPostalCode', e.target.value)
                    }
                    placeholder="Postal code"
                  />
                </FormField>
                <FormField
                  label="Country code"
                  error={fieldErrors.addressCountryCode}
                  helpText="Leave blank to use the station country code."
                >
                  <Input
                    value={form.addressCountryCode}
                    onChange={(e) =>
                      setField(
                        'addressCountryCode',
                        e.target.value.toUpperCase(),
                      )
                    }
                    placeholder="Country code"
                  />
                </FormField>
                <FormField
                  label="Country"
                  error={fieldErrors.country}
                  helpText="Leave blank to use the station country."
                >
                  <Input
                    value={form.country}
                    onChange={(e) => setField('country', e.target.value)}
                    placeholder="Country"
                  />
                </FormField>
              </div>
            </section>
          </div>

          <SheetFooter className="mt-4 border-t border-gray-100 pt-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={isSubmitting || !csrfToken}
              title={!csrfToken ? 'Loading security token…' : undefined}
            >
              {isSubmitting ? 'Saving…' : 'Save customer'}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default CustomerDrawer
