'use client'

import { useRef, useState } from 'react'

import { safeCopy } from '@/src/shared/utils/clipboard'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

type SupportBundleFallbackDialogProps = {
  transactionId: string
  text: string
  onClose: () => void
}

export default function SupportBundleFallbackDialog({
  transactionId,
  text,
  onClose,
}: SupportBundleFallbackDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [message, setMessage] = useState(
    'Clipboard access was blocked. Use Ctrl+C (Cmd+C on Mac) to copy the selected text, or download it.',
  )

  const selectAll = () => {
    textareaRef.current?.focus()
    textareaRef.current?.select()
  }

  const retryCopy = async () => {
    const copied = await safeCopy(text)
    setMessage(
      copied
        ? 'Support bundle copied to clipboard.'
        : 'Clipboard access is still blocked. Select all and press Ctrl+C (Cmd+C on Mac), or download the file.',
    )
    if (!copied) selectAll()
  }

  const download = () => {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download =
        'transaction-support-' +
        transactionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) +
        '.txt'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setMessage('Download was blocked. Select the text and copy it manually.')
      selectAll()
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          selectAll()
        }}
      >
        <DialogHeader>
          <DialogTitle>Transaction support bundle</DialogTitle>
          <DialogDescription>
            {message} This diagnostic information may include customer or
            transaction details; share it only with authorized support staff.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          ref={textareaRef}
          aria-label="Support bundle text"
          value={text}
          readOnly
          spellCheck={false}
          rows={12}
          className="max-h-[50vh] resize-y font-mono text-xs"
        />
        <DialogFooter className="flex-wrap">
          <Button variant="secondary" onClick={selectAll}>
            Select all
          </Button>
          <Button variant="secondary" onClick={download}>
            Download .txt
          </Button>
          <Button onClick={retryCopy}>Try copying again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
