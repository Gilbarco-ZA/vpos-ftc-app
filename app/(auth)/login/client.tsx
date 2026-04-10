'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

const LoginForm = () => {
  const [csrfToken, setCsrfToken] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [setupComplete, setSetupComplete] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setErrorMessage((params.get('error') || '').trim())
    setSetupComplete(params.get('setup') === 'complete')
  }, [])

  return (
    <Card className="animate-scale-in overflow-hidden shadow-elevated">
      <div
        className="border-b border-[var(--border-default)] px-6 py-6 sm:px-7"
        style={{
          backgroundImage:
            'linear-gradient(to bottom right, var(--surface-card), var(--surface-muted))',
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-hover)] transition-all duration-300 hover:border-blue-500/30 hover:bg-blue-500/10">
            <ShieldCheck className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              VPOS FTC
            </div>
            <div className="mt-0.5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              Sign in to continue
            </div>
          </div>
        </div>
      </div>

      <CsrfBootstrap onToken={setCsrfToken} />

      <CardHeader>
        <CardTitle>Station access</CardTitle>
        <CardDescription>
          Use your username or email to access the console on any screen size.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {setupComplete && (
          <Alert variant={STATUS_VARIANT.SUCCESS}>
            Basic setup complete. Sign in with the administrator account you
            just created.
          </Alert>
        )}

        {errorMessage && (
          <Alert variant={STATUS_VARIANT.ERROR}>{errorMessage}</Alert>
        )}

        <form className="space-y-5" method="post" action="/api/auth/login">
          <CsrfHiddenInput token={csrfToken} />

          <FormField label="Username / Email">
            <Input
              id="username"
              name="username"
              autoComplete="username"
              required
              placeholder="Enter your username or email"
            />
          </FormField>

          <FormField label="Password">
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                className="pr-11"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg px-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </FormField>

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-hover)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
              This system uses local station storage and continues syncing in
              the background.
            </span>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            title={
              !csrfToken
                ? 'Security token unavailable (continuing anyway)…'
                : undefined
            }
          >
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default LoginForm
