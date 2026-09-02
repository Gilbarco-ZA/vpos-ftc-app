'use client'

import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

import { KE_DATASET } from '@/src/shared/config/datasets/KE'
import { TZ_DATASET } from '@/src/shared/config/datasets/TZ'

import { RuntimeImage } from '@/components/ui/runtime-image'

import TanzaniaReceipt80mm from './TanzaniaReceipt80mm'

export type Receipt80mmProps = {
  receipt: NormalizedReceipt
}

const formatMoney = (value?: number, decimals = 2) => {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

const formatQty = (value?: number, decimals = 2) => {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

const Receipt80mm = ({ receipt }: Receipt80mmProps) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const decimals: DecimalSettings = receipt.decimals ?? {
    money: 2,
    volume: 2,
    unitPrice: 2,
  }

  const buildAmount = (qty?: number, unitPrice?: number, amount?: number) => {
    if (amount != null && Number.isFinite(amount)) return amount
    if (qty != null && unitPrice != null) return qty * unitPrice
    return undefined
  }

  const receiptCountry = String(receipt.header.country || '')
    .trim()
    .toUpperCase()
  const taxMap = (receiptCountry === 'TZ' ? TZ_DATASET : KE_DATASET).taxTypes

  const summaryByCode = receipt.items.reduce<
    Record<string, { name: string; rate: number; taxable: number; tax: number }>
  >((acc, item) => {
    const code = (item.taxType || 'B').toUpperCase()
    const map = taxMap.find((entry) => entry.code === code) || taxMap[1]
    const rate =
      item.taxRate != null && Number.isFinite(Number(item.taxRate))
        ? Number(item.taxRate)
        : map.rate
    const amount = buildAmount(item.qty, item.unitPrice, item.amount) || 0
    const taxable = amount / (1 + rate / 100)
    const tax = amount - taxable
    if (!acc[map.code])
      acc[map.code] = { name: map.name, rate, taxable: 0, tax: 0 }
    acc[map.code].taxable += taxable
    acc[map.code].tax += tax
    return acc
  }, {})

  const taxRows = taxMap.map((entry) => ({
    ...entry,
    rate: summaryByCode[entry.code]?.rate ?? entry.rate,
    name: summaryByCode[entry.code]?.name ?? entry.name,
    taxable: summaryByCode[entry.code]?.taxable ?? 0,
    tax: summaryByCode[entry.code]?.tax ?? 0,
  }))
  const itemsCount = receipt.items.length
  const computedTotal = taxRows.reduce(
    (sum, row) => sum + row.taxable + row.tax,
    0,
  )
  const hasTaxData = Object.keys(summaryByCode).length > 0
  const totalAmount = hasTaxData ? computedTotal : receipt.totals.amount
  const currency = receipt.totals.currency

  const showTin = receiptCountry === 'TZ'
  const showPin = receiptCountry === 'KE'

  useEffect(() => {
    const payload = receipt.footer.fiscalQrCodeData
    if (!payload) {
      queueMicrotask(() => setQrDataUrl(null))
      return
    }

    let active = true
    QRCode.toDataURL(payload, { width: 160, margin: 1 })
      .then((url: string) => {
        if (active) setQrDataUrl(url)
      })
      .catch(() => {
        if (active) setQrDataUrl(null)
      })

    return () => {
      active = false
    }
  }, [receipt.footer.fiscalQrCodeData])

  if (receiptCountry === 'TZ') {
    return <TanzaniaReceipt80mm receipt={receipt} />
  }

  const receiptHeaderLines = (receipt.branding?.receiptHeaderText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const receiptFooterLines = (receipt.branding?.receiptFooterText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="receipt-print-area mx-auto rounded-card border border-border bg-white p-4 font-mono text-xs text-black">
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body * {
            visibility: hidden !important;
          }
          .receipt-print-area,
          .receipt-print-area * {
            visibility: visible !important;
          }
          .receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 300px;
            border: none !important;
            box-shadow: none !important;
            color: #000 !important;
            background: #fff !important;
          }
          .receipt-print-area img {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="mx-auto text-center" style={{ width: 300 }}>
        {receipt.branding?.logoPath ? (
          <div className="mb-3 flex justify-center">
            <RuntimeImage
              src={receipt.branding.logoPath}
              alt="Station logo"
              className="max-h-16 max-w-[140px] object-contain"
            />
          </div>
        ) : null}

        {receiptHeaderLines.length ? (
          <div className="mb-3 space-y-0.5 text-center text-xs leading-relaxed text-black">
            {receiptHeaderLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        ) : null}

        <div className="text-sm font-semibold uppercase tracking-wide text-black">
          {receipt.header.title}
        </div>
        {receipt.meta.isOfflineFiscalization || receipt.meta.offlinePending ? (
          <div className="mt-2 rounded border border-black px-2 py-1 text-center text-xs font-bold uppercase tracking-wide text-black">
            Offline receipt - pending fiscalization
          </div>
        ) : null}
        <div className="mt-2 space-y-0.5 text-xs text-black">
          {receipt.header.companyName && (
            <div>{receipt.header.companyName}</div>
          )}
          {receipt.header.stationName && (
            <div>{receipt.header.stationName}</div>
          )}
          {showTin && receipt.header.companyTin && (
            <div>TIN: {receipt.header.companyTin}</div>
          )}
          {showPin && receipt.header.companyPin && (
            <div>PIN: {receipt.header.companyPin}</div>
          )}
          {receipt.header.companyVrn && (
            <div>VRN: {receipt.header.companyVrn}</div>
          )}
          {receipt.header.companyMobile && (
            <div>Tel: {receipt.header.companyMobile}</div>
          )}
          {receipt.header.companySerial && (
            <div>Serial: {receipt.header.companySerial}</div>
          )}
          {receipt.header.companyTaxOffice && (
            <div>Tax Office: {receipt.header.companyTaxOffice}</div>
          )}
        </div>

        <div className="my-3 border-t border-dashed border-black/60" />

        <div className="space-y-0.5 text-left text-xs text-black">
          {receipt.meta.receiptDateTime && (
            <div className="flex justify-between gap-3">
              <span>Date</span>
              <span className="text-right">{receipt.meta.receiptDateTime}</span>
            </div>
          )}
          {receipt.meta.documentNumber && (
            <div className="flex justify-between gap-3">
              <span>Invoice No</span>
              <span className="text-right">{receipt.meta.documentNumber}</span>
            </div>
          )}
          {receipt.meta.isOfflineFiscalization ? (
            <div className="flex justify-between gap-3 font-semibold">
              <span>Fiscal status</span>
              <span className="text-right">
                {receipt.meta.fiscalizationStatus || 'OFFLINE'}
              </span>
            </div>
          ) : null}
          {receipt.meta.fiscalReference && (
            <div className="flex justify-between gap-3">
              <span>Fiscal Ref</span>
              <span className="text-right">{receipt.meta.fiscalReference}</span>
            </div>
          )}
          {receipt.meta.receiptNumber && (
            <div className="flex justify-between gap-3">
              <span>Receipt No</span>
              <span className="text-right">{receipt.meta.receiptNumber}</span>
            </div>
          )}
          {receipt.meta.receiptZNumber && (
            <div className="flex justify-between gap-3">
              <span>Z No</span>
              <span className="text-right">{receipt.meta.receiptZNumber}</span>
            </div>
          )}
          {receipt.meta.attendant && (
            <div className="flex justify-between gap-3">
              <span>Attendant</span>
              <span className="text-right">{receipt.meta.attendant}</span>
            </div>
          )}
        </div>

        {receipt.buyer?.name || receipt.buyer?.tin || receipt.buyer?.pin ? (
          <>
            <div className="my-3 border-t border-dashed border-black/60" />
            <div className="space-y-0.5 text-left text-xs text-black">
              {receipt.buyer?.name && <div>Buyer: {receipt.buyer.name}</div>}
              {showTin && receipt.buyer?.tin && (
                <div>Buyer TIN: {receipt.buyer.tin}</div>
              )}
              {showPin && receipt.buyer?.pin && (
                <div>Buyer PIN: {receipt.buyer.pin}</div>
              )}
              {receipt.buyer?.vehicleRegNr && (
                <div>Vehicle Reg No: {receipt.buyer.vehicleRegNr}</div>
              )}
              {receipt.buyer?.odometer && (
                <div>Odometer: {receipt.buyer.odometer}</div>
              )}
              {receipt.buyer?.paymentType && (
                <div>Payment Type: {receipt.buyer.paymentType}</div>
              )}
            </div>
          </>
        ) : null}

        <div className="my-3 border-t border-dashed border-black/60" />

        <div className="text-left text-black">
          <div className="grid grid-cols-8 gap-2 text-xs font-semibold">
            <span className="col-span-3">Item</span>
            <span className="text-right">Tax</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="col-span-2 text-right">Amount</span>
          </div>
          <div className="mt-2 space-y-2">
            {receipt.items.map((item, idx) => (
              <div key={`${item.description}-${idx}`}>
                <div className="grid grid-cols-8 gap-2">
                  <div className="col-span-3 font-medium">
                    {item.description}
                  </div>
                  <span className="text-right text-xs">
                    {item.taxType ?? 'B'}
                  </span>
                  <span className="text-right text-xs">
                    {formatQty(item.qty, decimals.volume)}
                  </span>
                  <span className="text-right text-xs">
                    {formatMoney(item.unitPrice, decimals.unitPrice)}
                  </span>
                  <span className="col-span-2 text-right text-xs">
                    {formatMoney(
                      buildAmount(item.qty, item.unitPrice, item.amount),
                      decimals.money,
                    )}
                  </span>
                </div>
                {item.productCode ? (
                  <div className="mt-0.5 break-all text-xs leading-tight text-black">
                    {item.productCode}
                  </div>
                ) : null}
                {item.sku ? (
                  <div className="break-all text-xs leading-tight text-black">
                    SKU: {item.sku}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="my-3 border-t border-dashed border-black/60" />

        <div className="space-y-2 text-left text-xs text-black">
          <div className="grid grid-cols-3 gap-2 font-semibold">
            <span>Tax type</span>
            <span className="text-right">Taxable</span>
            <span className="text-right">Tax</span>
          </div>
          {taxRows.map((row) => (
            <div key={row.code} className="grid grid-cols-3 gap-2">
              <span>
                {row.code} - {row.rate > 0 ? `${row.rate}%` : row.name}
              </span>
              <span className="text-right">
                {formatMoney(row.taxable, decimals.money)}
              </span>
              <span className="text-right">
                {formatMoney(row.tax, decimals.money)}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 font-semibold">
            <span>Total</span>
            <span className="text-right">
              {currency ? `${currency} ` : ''}
              {formatMoney(totalAmount, decimals.money)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span>Items Number</span>
            <span className="text-right">{itemsCount}</span>
          </div>
        </div>

        <div className="my-3 border-t border-dashed border-black/60" />

        <div className="space-y-2 text-left text-xs text-black">
          {receipt.meta.scuId && (
            <div>
              <div className="font-semibold">SCU ID</div>
              <div className="break-all">{receipt.meta.scuId}</div>
            </div>
          )}
          {receipt.meta.cuInvoiceNo && (
            <div>
              <div className="font-semibold">CU INVOICE NO</div>
              <div className="break-all">{receipt.meta.cuInvoiceNo}</div>
            </div>
          )}
          {receipt.meta.receiptNumber && (
            <div>
              <div className="font-semibold">RECEIPT NO</div>
              <div className="break-all">{receipt.meta.receiptNumber}</div>
            </div>
          )}
          {receipt.footer.receiptInternalData && (
            <div>
              <div className="font-semibold">Internal Data</div>
              <div className="break-all">
                {receipt.footer.receiptInternalData}
              </div>
            </div>
          )}
          {receipt.footer.receiptSignature && (
            <div>
              <div className="font-semibold">Signature</div>
              <div className="break-all">{receipt.footer.receiptSignature}</div>
            </div>
          )}
          {receipt.footer.fiscalVerificationCode && (
            <div>
              <div className="font-semibold">Verification Code</div>
              <div className="break-all">
                {receipt.footer.fiscalVerificationCode}
              </div>
            </div>
          )}
        </div>

        {qrDataUrl && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <RuntimeImage
              src={qrDataUrl}
              alt="Receipt QR"
              className="h-32 w-32"
            />
            <div className="text-xs text-black/70">Scan to verify</div>
          </div>
        )}

        {receiptFooterLines.length ? (
          <div className="mt-4 space-y-0.5 text-center text-xs leading-relaxed text-black">
            {receiptFooterLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        ) : null}

        {receipt.footer.copyLabel && (
          <div className="mt-4 text-center text-xs font-semibold text-black">
            {receipt.footer.copyLabel}
          </div>
        )}
      </div>
    </div>
  )
}

export default Receipt80mm
