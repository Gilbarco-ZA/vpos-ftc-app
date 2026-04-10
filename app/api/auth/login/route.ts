import type { User } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import { wantsHtmlRedirect } from '@/src/platform/web/api/request'
import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { auditUserLogin } from '@/src/shared/audit/log'
import {
  authenticateUser,
  clearRateLimit,
  createSession,
  setSessionCookie,
} from '@/src/shared/auth'
import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'

export const dynamic = 'force-dynamic'

type Body = Record<string, any>

export const POST = definePublicMutationRoute<Body>({
  handler: async (req, { body }) => {
    let user: User | null = null
    try {
      const username = String(body.username || '').trim()
      const password = String(body.password || '')

      if (!username || !password) {
        const errorMessage = 'Username and password are required'
        if (wantsHtmlRedirect(req)) {
          return new NextResponse(null, {
            status: 303,
            headers: {
              Location: `/login?error=${encodeURIComponent(errorMessage)}`,
            },
          })
        }
        return fail(errorMessage, 400)
      }

      user = await authenticateUser(username, password)
      if (!user) {
        const errorMessage = 'Invalid credentials'
        if (wantsHtmlRedirect(req)) {
          return new NextResponse(null, {
            status: 303,
            headers: {
              Location: `/login?error=${encodeURIComponent(errorMessage)}`,
            },
          })
        }
        return fail(errorMessage, 401)
      }

      await clearRateLimit(`login:${username}`).catch(() => {})

      const session = await createSession(user.id)
      await setSessionCookie(session.token, session.expiresAt)

      await auditUserLogin(user.stationId, user.id).catch(() => {})

      if (wantsHtmlRedirect(req)) {
        return new NextResponse(null, {
          status: 303,
          headers: {
            Location: '/dashboard',
          },
        })
      }

      return ok({ expiresAt: session.expiresAt })
    } catch (error) {
      const msg = String((error as any)?.message || '')
      if (msg.includes('CSRF')) {
        const errorMessage = 'CSRF validation failed'
        if (wantsHtmlRedirect(req)) {
          return new NextResponse(null, {
            status: 303,
            headers: {
              Location: `/login?error=${encodeURIComponent(errorMessage)}`,
            },
          })
        }
        return fail(errorMessage, 403)
      }
      return await serverError(error, { req })
    }
  },
})
