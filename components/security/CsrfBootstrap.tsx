'use client'

import { useEffect } from 'react'

const CsrfBootstrap = (props: { onToken?: (token: string) => void }) => {
  useEffect(() => {
    let cancelled = false
    // On first boot, migrations and initial I/O can take a few seconds.
    // Retry a few times before giving up so the setup wizard doesn't get stuck disabled.
    const fetchToken = async () => {
      const maxAttempts = 5
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const attemptController = new AbortController()
        const timeout = setTimeout(() => attemptController.abort(), 10_000)

        try {
          const r = await fetch('/api/security/csrf', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal: attemptController.signal,
          })
          const j = await r.json().catch(() => ({}))
          if (cancelled) return
          if (j?.token && typeof j.token === 'string') {
            props.onToken?.(j.token)
            return
          }
        } catch {
        } finally {
          clearTimeout(timeout)
        }

        // small backoff (1s, 2s, 3s, 4s)
        await new Promise((res) => setTimeout(res, attempt * 1000))
      }
    }

    fetchToken()

    return () => {
      cancelled = true
    }
  }, [props.onToken])

  return null
}

export default CsrfBootstrap
