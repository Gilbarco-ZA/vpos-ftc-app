'use client'

import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { RuntimeImage } from '@/components/ui/runtime-image'

type Props = { receipt: NormalizedReceipt }
const amount = (v?: number, digits = 2) => v == null || !Number.isFinite(v)
  ? '—' : v.toLocaleString('en-KE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const formattedDate = (value: string) => { const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : value }
const dashGroups = (value: string) => value.replace(/[^A-Za-z0-9]/g, '').match(/.{1,4}/g)?.join('-') ?? value
const isKraUrl = (value?: string) => /^https:\/\/[^\s]+$/i.test(String(value ?? ''))

export default function KenyaReceipt80mm({ receipt }: Props) {
  const [qr, setQr] = useState<string | null>(null)
  const verificationUrl = receipt.footer.fiscalQrCodeData
  useEffect(() => {
    let active = true
    if (!isKraUrl(verificationUrl)) {
      queueMicrotask(() => { if (active) setQr(null) })
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
      <style jsx global>{`@media print { .no-print { display: none !important; } body * { visibility: hidden !important; } .receipt-print-area, .receipt-print-area * { visibility: visible !important; } .receipt-print-area { position: absolute; left: 0; top: 0; width: 300px; background: white !important; color: black !important; } .receipt-print-area img { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
      <div className="text-center">
        <div className="font-bold">{receipt.header.companyName || receipt.header.stationName}</div>
        {receipt.header.companyPin && <div>PIN: {receipt.header.companyPin}</div>}
        <div className="text-sm font-bold">TAX INVOICE</div>
        {receipt.branding?.receiptHeaderText?.split(/\r?\n/).filter(Boolean).map((message, i) => <div key={i}>{message}</div>)}
        {receipt.meta.isOfflineFiscalization || receipt.meta.offlinePending
          ? <div className="font-bold">PENDING FISCALIZATION</div>
          : null}
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
      {row('TOTAL DISCOUNT AWARDED', amount(discount, decimals.money))}
      {row('SUB TOTAL', amount(net, decimals.money))}
      {row('VAT', amount(tax, decimals.money))}
      {row('TOTAL', amount(total, decimals.money), true)}
      {separator}
      {row((receipt.totals.paymentMethod || 'PAYMENT').toUpperCase(), amount(total, decimals.money))}
      {row('ITEMS NUMBER', String(receipt.items.length))}
      {separator}
      <div className="grid grid-cols-[22%_45%_33%] border-b border-dashed border-black pb-1 text-center font-bold">
        <span>Rate</span><span>Taxable Amount</span><span>VAT</span>
      </div>
      {['A', 'B', 'C', 'D', 'E', ...Object.keys(taxRows).filter(code => !['A', 'B', 'C', 'D', 'E'].includes(code))].map(code => {
        const t = taxRows[code] ?? { rate: code === 'B' ? 16 : code === 'E' ? 8 : 0, taxable: 0, tax: 0 }
        return <div key={code} className="grid grid-cols-[22%_45%_33%] text-center tabular-nums">
          <span>{code} {t.rate}%</span>
          <span>{amount(t.taxable, decimals.money)}</span>
          <span>{amount(t.tax, decimals.money)}</span>
        </div>
      })}
      {separator}
      <div className="text-center font-bold">SCU INFORMATION</div>
      {(receipt.meta.receiptDate || receipt.meta.receiptDateTime) && <div>Date: {formattedDate(receipt.meta.receiptDate || receipt.meta.receiptDateTime || '')}</div>}
      {(receipt.meta.receiptTime || receipt.meta.receiptDateTime?.match(/\d{2}:\d{2}:\d{2}/)?.[0]) && <div>Time: {receipt.meta.receiptTime || receipt.meta.receiptDateTime?.match(/\d{2}:\d{2}:\d{2}/)?.[0]}</div>}
      {receipt.footer.fiscalVerificationCode && <div>SCU ID: {receipt.footer.fiscalVerificationCode}</div>}
      {receipt.meta.receiptNumber && <div>CU INVOICE NO: {receipt.meta.receiptNumber}</div>}
      {receipt.footer.receiptInternalData && <div className="break-all">Internal Data: {dashGroups(receipt.footer.receiptInternalData)}</div>}
      {receipt.footer.receiptSignature && <div className="break-all">Receipt Signature: {receipt.footer.receiptSignature}</div>}
      {qr && <div className="mt-3 flex flex-col items-center gap-1">
        <RuntimeImage src={qr} alt="KRA eTIMS verification QR" width={160} height={160} />
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
      {receipt.branding?.receiptFooterText?.split(/\\r?\\n/).filter(Boolean).map((message, i) => <div className="text-center" key={i}>{message}</div>)}
      {receipt.footer.copyLabel && <div className="text-center">{receipt.footer.copyLabel}</div>}
    </div>
  )
}
