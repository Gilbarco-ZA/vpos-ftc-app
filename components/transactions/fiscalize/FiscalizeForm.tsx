'use client'

import { useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'

export const FiscalizeForm = ({ transactionId }: { transactionId: string }) => {
  const [csrfToken, setCsrfToken] = useState('')

  return (
    <form action="/api/transactions/fiscalize" method="post">
      <CsrfBootstrap onToken={setCsrfToken} />
      <CsrfHiddenInput token={csrfToken} />
      <input type="hidden" name="transactionId" value={transactionId} />
      <Button type="submit" variant="primary">
        Send to Fiscalize
      </Button>
    </form>
  )
}
