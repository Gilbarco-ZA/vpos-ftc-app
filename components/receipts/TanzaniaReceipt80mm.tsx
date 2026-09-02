'use client'

import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

import { RuntimeImage } from '@/components/ui/runtime-image'

export type TanzaniaReceipt80mmProps = {
  receipt: NormalizedReceipt
}

const formatNumber = (value?: number, decimals = 0) => {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

const splitLines = (value?: string) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

const TanzaniaReceipt80mm = ({ receipt }: TanzaniaReceipt80mmProps) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const decimals: DecimalSettings = receipt.decimals ?? {
    money: 2,
    volume: 2,
    unitPrice: 2,
  }
  const headerLines = splitLines(receipt.branding?.receiptHeaderText)
  const footerLines = splitLines(receipt.branding?.receiptFooterText)
  const amount = Number(receipt.totals.amount ?? 0)
  const tax = Number(receipt.totals.tax ?? 0)
  const net =
    receipt.totals.net == null ? amount - tax : Number(receipt.totals.net)
  const discount = Number(receipt.totals.discount ?? 0)
  const receiptNumber =
    receipt.meta.receiptTraNumber || receipt.meta.receiptNumber
  const receiptDate = receipt.meta.receiptDate || receipt.meta.receiptDateTime
  const paymentMethod =
    receipt.totals.paymentMethod || receipt.buyer?.paymentType || 'Cash'
  const customerName = String(receipt.buyer?.name ?? '').trim()
  const customerTin = String(receipt.buyer?.tin ?? '').trim()
  const hasCustomerName =
    Boolean(customerName) && customerName.toLowerCase() !== 'walk-in customer'
  const hasCustomerTin = Boolean(customerTin) && customerTin !== 'N/A'
  const customerIdType = hasCustomerTin ? '1' : '6'

  useEffect(() => {
    const payload = receipt.footer.fiscalQrCodeData
    if (!payload) {
      queueMicrotask(() => setQrDataUrl(null))
      return
    }

    let active = true
    QRCode.toDataURL(payload, { width: 220, margin: 1 })
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

      <div className="mx-auto text-black" style={{ width: 300 }}>
        <RuntimeImage
          src="/assets/tra/TRA_receipt_start.png"
          alt="TRA fiscal receipt header"
          className="mb-3 h-auto w-full"
        />

        {receipt.branding?.logoPath ? (
          <div className="mb-3 flex justify-center">
            <RuntimeImage
              src={receipt.branding.logoPath}
              alt="Station logo"
              className="max-h-16 max-w-[140px] object-contain"
            />
          </div>
        ) : null}

        {headerLines.length ? (
          <div className="mb-3 space-y-0.5 text-center leading-relaxed">
            {headerLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        ) : null}

        <div className="text-center">
          <div className="text-sm font-bold uppercase">
            {receipt.branding?.stationDisplayName ||
              receipt.header.companyName ||
              receipt.header.stationName ||
              'Station'}
          </div>
          {receipt.header.companyMobile ? (
            <div>MOBILE: {receipt.header.companyMobile}</div>
          ) : null}
          {receipt.header.companyTin ? (
            <div>TIN: {receipt.header.companyTin}</div>
          ) : null}
          {receipt.header.companyVrn ? (
            <div>VRN: {receipt.header.companyVrn}</div>
          ) : null}
          {receipt.header.companySerial ? (
            <div>SERIAL NO: {receipt.header.companySerial}</div>
          ) : null}
          {receipt.header.companyUin ? (
            <div>UIN: {receipt.header.companyUin}</div>
          ) : null}
          {receipt.header.companyTaxOffice ? (
            <div>TAX OFFICE: {receipt.header.companyTaxOffice}</div>
          ) : null}
        </div>

        {hasCustomerName || hasCustomerTin ? (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <div className="space-y-0.5">
              <div className="flex justify-between gap-3">
                <span>CUSTOMER ID TYPE:</span>
                <span className="text-right">{customerIdType}</span>
              </div>
              {hasCustomerTin ? (
                <div className="flex justify-between gap-3">
                  <span>CUSTOMER ID:</span>
                  <span className="text-right">{customerTin}</span>
                </div>
              ) : null}
              {hasCustomerName ? (
                <div className="flex justify-between gap-3">
                  <span>CUSTOMER NAME:</span>
                  <span className="text-right">{customerName}</span>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="my-2 border-t border-dashed border-black" />
        <div className="space-y-0.5">
          {receiptNumber ? (
            <div className="flex justify-between gap-3">
              <span>RECEIPT NUMBER:</span>
              <span className="text-right">{receiptNumber}</span>
            </div>
          ) : null}
          {receipt.meta.receiptZNumber ? (
            <div className="flex justify-between gap-3">
              <span>Z NUMBER:</span>
              <span className="text-right">{receipt.meta.receiptZNumber}</span>
            </div>
          ) : null}
          {receiptDate ? (
            <div className="flex justify-between gap-3">
              <span>RECEIPT DATE:</span>
              <span className="text-right">{receiptDate}</span>
            </div>
          ) : null}
          {receipt.meta.receiptTime ? (
            <div className="flex justify-between gap-3">
              <span>RECEIPT TIME:</span>
              <span className="text-right">{receipt.meta.receiptTime}</span>
            </div>
          ) : null}
        </div>

        {receipt.meta.pumpNumber || receipt.meta.nozzleNumber ? (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <div>
              PUMP: {receipt.meta.pumpNumber || '-'} | NOZZLE:{' '}
              {receipt.meta.nozzleNumber || '-'}
            </div>
          </>
        ) : null}

        <div className="my-2 border-t border-dashed border-black" />
        <div className="space-y-1">
          {receipt.items.map((item, index) => {
            const lineAmount =
              item.amount ??
              (item.qty != null && item.unitPrice != null
                ? item.qty * item.unitPrice
                : undefined)
            return (
              <div
                key={`${item.description}-${index}`}
                className="grid grid-cols-[1fr_auto] gap-2"
              >
                <span>
                  {item.description} {formatNumber(item.qty, decimals.volume)} x{' '}
                  {formatNumber(item.unitPrice, decimals.unitPrice)}
                </span>
                <span className="text-right">
                  {formatNumber(lineAmount, decimals.money)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="my-2 border-t border-dashed border-black" />
        <div className="space-y-1">
          <div className="flex justify-between gap-3">
            <span>TOTAL EXCL TAX:</span>
            <span>{formatNumber(net, decimals.money)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>DISCOUNT:</span>
            <span>{formatNumber(discount, decimals.money)}</span>
          </div>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="flex justify-between gap-3">
            <span>TOTAL TAX:</span>
            <span>{formatNumber(tax, decimals.money)}</span>
          </div>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="flex justify-between gap-3 font-bold">
            <span>TOTAL INCL TAX:</span>
            <span>{formatNumber(amount, decimals.money)}</span>
          </div>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="flex justify-between gap-3">
            <span>PAYMENT METHOD:</span>
            <span>{paymentMethod}</span>
          </div>
        </div>

        {receipt.footer.fiscalVerificationCode ? (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <div className="text-center">
              <div>RECEIPT VERIFICATION CODE</div>
              <div className="break-all font-bold">
                {receipt.footer.fiscalVerificationCode}
              </div>
            </div>
          </>
        ) : null}

        {qrDataUrl ? (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <div className="flex justify-center">
              <RuntimeImage
                src={qrDataUrl}
                alt="TRA receipt verification QR"
                className="h-40 w-40"
              />
            </div>
          </>
        ) : null}

        {footerLines.length ? (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <div className="space-y-0.5 text-center leading-relaxed">
              {footerLines.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
          </>
        ) : null}

        <RuntimeImage
          src="/assets/tra/TRA_receipt_end.png"
          alt="TRA fiscal receipt footer"
          className="mt-3 h-auto w-full"
        />
      </div>
    </div>
  )
}

export default TanzaniaReceipt80mm
