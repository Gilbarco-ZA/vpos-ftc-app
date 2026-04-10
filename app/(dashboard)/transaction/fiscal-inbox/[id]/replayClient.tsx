'use client'

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function ReplayClient({
  id,
  requestId,
  messageJson,
}: {
  id: number
  requestId: string | null
  messageJson: any
}) {
  const initial = useMemo(() => {
    try {
      return JSON.stringify(messageJson, null, 2)
    } catch {
      return String(messageJson ?? '')
    }
  }, [messageJson])

  const [newRequestId, setNewRequestId] = useState<string>(requestId ?? '')
  const [text, setText] = useState<string>(initial)

  const cloneRequeue = async () => {
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      alert('Invalid JSON: please fix before cloning')
      return
    }

    const res = await fetch(`/api/runtime/fiscal/inbox/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'CLONE_REQUEUE',
        requestId: newRequestId || undefined,
        messageJson: parsed,
      }),
    })

    if (!res.ok) {
      const t = await res.text().catch(() => 'Request failed')
      alert(t)
      return
    }
    const out = await res.json().catch(() => null as any)
    const newId = out?.id
    if (newId) {
      window.location.href = `/transaction/fiscal-inbox/${newId}`
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="space-y-3 rounded border bg-[var(--surface-card)] p-4">
      <div>
        <div className="text-sm font-medium">
          Replay (clone & requeue with edits)
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          This will create a NEW inbox row with status PENDING using the edited
          JSON.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <FormField label="Request ID (optional override)">
            <Input
              value={newRequestId}
              onChange={(e) => setNewRequestId(e.target.value)}
              className="font-mono"
              placeholder="leave blank to keep"
            />
          </FormField>
        </div>
        <div className="flex items-end md:col-span-2">
          <Button variant="secondary" size="sm" onClick={cloneRequeue}>
            Clone & Requeue
          </Button>
        </div>
      </div>

      <div>
        <FormField label="Edited message_json">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-64 font-mono text-xs"
            spellCheck={false}
          />
        </FormField>
      </div>
    </div>
  )
}
