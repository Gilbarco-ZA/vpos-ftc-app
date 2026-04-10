'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export type ReceiptPreviewProps = {
  title?: string
  subtitle?: string
  text: string
  actions?: React.ReactNode
}

const ReceiptPreview = ({
  title,
  subtitle,
  text,
  actions,
}: ReceiptPreviewProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {title && (
              <div className="text-sm font-semibold text-gray-900">{title}</div>
            )}
            {subtitle && (
              <div className="text-xs text-gray-500">{subtitle}</div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy raw text'}
            </Button>
          </div>
        </div>
      </div>
      <div className="bg-gray-50 p-4">
        <pre className="overflow-auto rounded-lg border border-border bg-white p-4 text-xs leading-relaxed text-gray-800">
          {text}
        </pre>
      </div>
    </Card>
  )
}

export default ReceiptPreview
