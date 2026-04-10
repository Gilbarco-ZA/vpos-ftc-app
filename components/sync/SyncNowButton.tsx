'use client'

import { useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { Select } from '@/components/ui/select'

type Props = {
  action?: string
  defaultDirection?: 'both' | 'push' | 'pull'
  showForce?: boolean
}

export const SyncNowButton = ({
  action = '/api/sync/run',
  defaultDirection = 'both',
  showForce = true,
}: Props) => {
  const [direction, setDirection] = useState<'both' | 'push' | 'pull'>(
    defaultDirection,
  )
  const [force, setForce] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')

  const onDirectionChange = (value: string) => {
    if (value === 'both' || value === 'push' || value === 'pull') {
      setDirection(value)
    }
  }

  return (
    <form action={action} method="post" className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      <CsrfHiddenInput token={csrfToken} />

      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="force" value={force ? 'true' : 'false'} />

      <div className="flex flex-wrap items-end gap-3">
        <FormField label="Direction" className="min-w-[240px]">
          <Select
            value={direction}
            onChange={(e) => onDirectionChange(e.target.value)}
            name="_direction_ui"
          >
            <option value="both">Push + Pull</option>
            <option value="push">Push (Local → Cloud)</option>
            <option value="pull">Pull (Cloud → Local)</option>
          </Select>
        </FormField>

        {showForce && (
          <label className="inline-flex h-10 items-center gap-2 text-sm text-[var(--text-primary)]">
            <Checkbox
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Force (override sync_in_progress)
          </label>
        )}

        <Button type="submit" variant="primary">
          Sync Now
        </Button>
      </div>
    </form>
  )
}
