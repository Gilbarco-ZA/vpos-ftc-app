'use client'

import { useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

type Props = {
  action?: string
  showForce?: boolean
  showTankStatus?: boolean
  defaultIncludeTankStatus?: boolean
}

export const ForecourtSyncButton = ({
  action = '/api/admin/forecourt-sync/run',
  showForce = true,
  showTankStatus = true,
  defaultIncludeTankStatus = true,
}: Props) => {
  const [force, setForce] = useState(false)
  const [includeTankStatus, setIncludeTankStatus] = useState(
    defaultIncludeTankStatus,
  )
  const [csrfToken, setCsrfToken] = useState('')

  return (
    <form action={action} method="post" className="space-y-3">
      <CsrfBootstrap onToken={setCsrfToken} />
      <CsrfHiddenInput token={csrfToken} />

      <input type="hidden" name="force" value={force ? 'true' : 'false'} />
      <input
        type="hidden"
        name="includeTankStatus"
        value={includeTankStatus ? 'true' : 'false'}
      />

      <div className="flex flex-wrap items-center gap-3">
        {showTankStatus && (
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Checkbox
              checked={includeTankStatus}
              onChange={(e) => setIncludeTankStatus(e.target.checked)}
            />
            Include tank status
          </label>
        )}

        {showForce && (
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Checkbox
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Force (override lock)
          </label>
        )}
      </div>

      <Button type="submit" variant="primary">
        Run forecourt sync
      </Button>
    </form>
  )
}
