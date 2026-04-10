'use client'

import { useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'

const LogoutForm = () => {
  const [csrfToken, setCsrfToken] = useState('')

  return (
    <form action="/api/auth/logout" method="post" className="space-y-3">
      <CsrfBootstrap onToken={setCsrfToken} />
      <CsrfHiddenInput token={csrfToken} />

      <Button
        type="submit"
        variant="primary"
        disabled={!csrfToken}
        title={!csrfToken ? 'Loading CSRF token…' : undefined}
      >
        Logout
      </Button>
    </form>
  )
}

export default LogoutForm
