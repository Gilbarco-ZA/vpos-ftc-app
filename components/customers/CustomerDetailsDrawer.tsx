'use client'

import { Button } from '@/components/ui/button'
import { DetailItem, DetailList } from '@/components/ui/detail-list'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export type CustomerDetails = {
  id: string
  buyerName: string
  tin: string
  buyerType?: string | null
  pin?: string | null
  passportNumber?: string | null
  businessName?: string | null
  taxNinbrn?: string | null
  contactPerson?: string | null
  contactPhone?: string | null
  contactMobile?: string | null
  contactFax?: string | null
  contactEmail?: string | null
  contactWebsite?: string | null
  addressStreet?: string | null
  addressCity?: string | null
  addressState?: string | null
  addressProvince?: string | null
  addressPostalCode?: string | null
  addressCountryCode?: string | null
  country?: string | null
  odometer?: string | null
  vehicleRegNr?: string | null
  paymentType?: string | null
  lastSeenAt?: string | null
  deletedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type CustomerDetailsDrawerProps = {
  open: boolean
  customer?: CustomerDetails | null
  onOpenChange: (open: boolean) => void
  onEdit?: () => void
}

const renderValue = (value?: string | null) => (value ? String(value) : '—')

export const CustomerDetailsDrawer = ({
  open,
  customer,
  onOpenChange,
  onEdit,
}: CustomerDetailsDrawerProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[95vw] max-w-lg">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Customer details</SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-2 text-sm text-[var(--text-secondary)]">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                Identity
              </div>
              <DetailList columns={2}>
                <DetailItem label="Buyer name">
                  {renderValue(customer?.buyerName)}
                </DetailItem>
                <DetailItem label="TIN">
                  {renderValue(customer?.tin)}
                </DetailItem>
                <DetailItem label="Buyer type">
                  {renderValue(customer?.buyerType)}
                </DetailItem>
                <DetailItem label="Business name">
                  {renderValue(customer?.businessName)}
                </DetailItem>
              </DetailList>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                Vehicle & payment defaults
              </div>
              <DetailList columns={2}>
                <DetailItem label="Odometer">
                  {renderValue(customer?.odometer)}
                </DetailItem>
                <DetailItem label="Vehicle reg no.">
                  {renderValue(customer?.vehicleRegNr)}
                </DetailItem>
                <DetailItem label="Payment type">
                  {renderValue(customer?.paymentType)}
                </DetailItem>
              </DetailList>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                Contact
              </div>
              <DetailList columns={2}>
                <DetailItem label="Contact person">
                  {renderValue(customer?.contactPerson)}
                </DetailItem>
                <DetailItem label="Phone">
                  {renderValue(customer?.contactPhone)}
                </DetailItem>
                <DetailItem label="Mobile">
                  {renderValue(customer?.contactMobile)}
                </DetailItem>
                <DetailItem label="Email">
                  {renderValue(customer?.contactEmail)}
                </DetailItem>
                <DetailItem label="Website">
                  {renderValue(customer?.contactWebsite)}
                </DetailItem>
              </DetailList>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                Address
              </div>
              <DetailList columns={2}>
                <DetailItem label="Street">
                  {renderValue(customer?.addressStreet)}
                </DetailItem>
                <DetailItem label="City">
                  {renderValue(customer?.addressCity)}
                </DetailItem>
                <DetailItem label="State">
                  {renderValue(customer?.addressState)}
                </DetailItem>
                <DetailItem label="Province">
                  {renderValue(customer?.addressProvince)}
                </DetailItem>
                <DetailItem label="Postal code">
                  {renderValue(customer?.addressPostalCode)}
                </DetailItem>
                <DetailItem label="Country">
                  {renderValue(
                    customer?.country || customer?.addressCountryCode,
                  )}
                </DetailItem>
              </DetailList>
            </div>

            <Separator />

            <DetailList columns={2}>
              <DetailItem label="Last seen">
                {renderValue(customer?.lastSeenAt)}
              </DetailItem>
              <DetailItem label="Status">
                {customer?.deletedAt ? 'Deleted' : 'Active'}
              </DetailItem>
            </DetailList>
          </div>

          <SheetFooter className="mt-4 border-t border-gray-100 pt-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {onEdit && (
              <Button variant="primary" onClick={onEdit}>
                Edit
              </Button>
            )}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default CustomerDetailsDrawer
