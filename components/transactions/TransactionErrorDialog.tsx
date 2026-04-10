'use client'

import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type TransactionErrorDialogProps = {
  open: boolean
  title?: string
  description?: string
  errorText: string
  onOpenChange: (open: boolean) => void
}

const safeSnippet = (value: string, max = 220) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

export const TransactionErrorDialog = ({
  open,
  title = 'Error details',
  description,
  errorText,
  onOpenChange,
}: TransactionErrorDialogProps) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  const snippet = useMemo(() => safeSnippet(errorText), [errorText])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(errorText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ||
              (snippet
                ? 'Copy the full error and share it with support if needed.'
                : 'No error details were provided.')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <pre className="max-h-[55vh] overflow-auto rounded-card border border-border bg-surface-muted p-4 text-xs leading-relaxed text-[var(--text-primary)]">
            {errorText || '—'}
          </pre>
        </div>
        <DialogFooter className="mt-4">
          <Button
            variant="secondary"
            onClick={handleCopy}
            disabled={!errorText}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TransactionErrorDialog
