'use client'

import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

type Props = { receipt: NormalizedReceipt }
const amount = (v?: number, digits = 2) => v == null || !Number.isFinite(v)
  ? '—' : v.toLocaleString('en-KE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const isKraUrl = (value?: string) => /^https:\/\/[^\s]+$/i.test(String(value ?? ''))

export default function KenyaReceipt80mm({ receipt }: Props) {
  const [qr, setQr] = useState<string | null>(null)
  const verificationUrl = receipt.footer.fiscalQrCodeData
  useEffect(() => {
    let active = true
    if (!isKraUrl(verificationUrl)) {
      setQr(null)
      return
    }
    QRCode.toDataURL(verificationUrl!, { width: 180, margin: 1 })
      .then(image => { if (active) setQr(image) })
      .catch(() => { if (active) setQr(null) })
    return () => { active = false }
  }, [verificationUrl])

  const decimals = receipt.decimals ?? { money: 2, unitPrice: 2, volume: 2 }
  const total = receipt.totals.amount
  const tax = receipt.totals.tax
  const net = receipt.totals.net ?? (total != null && tax != null ? total - tax : undefined)
  const discount = receipt.totals.discount ?? 0
  const taxRows = receipt.items.reduce<Record<string, { taxable: number; tax: number; rate: number }>>((rows, item) => {
    const code = (item.taxType || 'B').toUpperCase()
    const rate = Number(item.taxRate ?? (code === 'B' ? 16 : 0))
    const gross = Number(item.amount ?? (Number(item.qty ?? 0) * Number(item.unitPrice ?? 0)))
    const taxable = gross / (1 + rate / 100)
    const taxAmount = gross - taxable
    const row = rows[code] ?? { taxable: 0, tax: 0, rate }
    row.taxable += taxable
    row.tax += taxAmount
    rows[code] = row
    return rows
  }, {})
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? 'font-bold' : ''}`}>
      <span>{label}</span><span className="text-right">{value}</span>
    </div>
  )
  const separator = <div className="my-3 border-t border-dashed border-black" />
  return (
    <div className="receipt-print-area mx-auto w-[300px] max-w-full bg-white p-3 font-mono text-xs leading-relaxed text-black">
      <div className="text-center">
        <div className="text-sm font-bold">TAX INVOICE</div>
        <div className="font-bold">{receipt.header.companyName || receipt.header.stationName}</div>
        {receipt.header.companyPin && <div>PIN: {receipt.header.companyPin}</div>}
        {receipt.meta.isOfflineFiscalization || receipt.meta.offlinePending
          ? <div className="font-bold">PENDING FISCALIZATION</div>
          : <div>Normal Invoice</div>}
      </div>
      {separator}
      {receipt.buyer?.name && <div>Buyer: {receipt.buyer.name}</div>}
      {(receipt.buyer?.pin || receipt.buyer?.tin) && <div>Buyer PIN: {receipt.buyer.pin || receipt.buyer.tin}</div>}
      {separator}
      {receipt.items.map((item, i) => (
        <div key={i}>
          <div>{item.description}</div>
          {row(`${amount(item.qty, decimals.volume)} x ${amount(item.unitPrice, decimals.unitPrice)}`,
            `${amount(item.amount ?? Number(item.qty ?? 0) * Number(item.unitPrice ?? 0), decimals.money)} ${item.taxType || ''}`)}
        </div>
      ))}
      {separator}
      {row('TOTAL BEFORE DISCOUNT', amount(total != null ? total + discount : undefined, decimals.money))}
      {discount !== 0 && row('TOTAL DISCOUNT AWARDED', amount(discount, decimals.money))}
      {row('SUB TOTAL', amount(net, decimals.money))}
      {row('VAT', amount(tax, decimals.money))}
      {row('TOTAL', amount(total, decimals.money), true)}
      {separator}
      {row((receipt.totals.paymentMethod || 'PAYMENT').toUpperCase(), amount(total, decimals.money))}
      {row('ITEMS NUMBER', String(receipt.items.length))}
      {separator}
      <div className="font-bold">Rate / Taxable Amount / VAT</div>
      {Object.entries(taxRows).map(([code, t]) => (
        <div key={code}>{row(`${code} ${t.rate}%`,
          `${amount(t.taxable, decimals.money)} / ${amount(t.tax, decimals.money)}`)}</div>
      ))}
      {separator}
      <div className="text-center font-bold">SCU INFORMATION</div>
      {receipt.meta.receiptDateTime && <div>Date/Time: {receipt.meta.receiptDateTime}</div>}
      {receipt.meta.scuId && <div>SCU ID: {receipt.meta.scuId}</div>}
      {receipt.meta.cuInvoiceNo && <div>CU INVOICE NO: {receipt.meta.cuInvoiceNo}</div>}
      {receipt.meta.receiptNumber && <div>Receipt Number: {receipt.meta.receiptNumber}</div>}
      {receipt.footer.receiptInternalData && <div className="break-all">Internal Data: {receipt.footer.receiptInternalData}</div>}
      {receipt.footer.receiptSignature && <div className="break-all">Receipt Signature: {receipt.footer.receiptSignature}</div>}
      {receipt.footer.fiscalVerificationCode && <div className="break-all">Verification Code: {receipt.footer.fiscalVerificationCode}</div>}
      {qr && <div className="mt-3 flex flex-col items-center gap-1">
        <div>KRA Verification QR</div>
        <img src={qr} alt="KRA eTIMS verification QR" width={160} height={160} />
      </div>}
      {separator}
      {receipt.meta.receiptTraNumber && <>
        <div className="text-center font-bold">TIS INFORMATION</div>
        {row('RECEIPT NUMBER', receipt.meta.receiptTraNumber)}
        {receipt.meta.receiptDate && row('DATE', receipt.meta.receiptDate)}
        {receipt.meta.receiptTime && row('TIME', receipt.meta.receiptTime)}
        {separator}
      </>}
      <div className="text-center font-bold">THANK YOU</div>
      {receipt.footer.copyLabel && <div className="text-center">{receipt.footer.copyLabel}</div>}
    </div>
  )
}
