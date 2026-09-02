import { NextResponse } from 'next/server'

import { ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import {
  clearSessionCookie,
  deleteSession,
  getCurrentUser,
  getSessionCookie,
} from '@/src/shared/auth'

const resolveOrigin = (value: string | null) => {
  if (!value) return ''

  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

const resolveLogoutRedirectTarget = (req: Request) => {
  const browserOrigin =
    resolveOrigin(req.headers.get('origin')) ||
    resolveOrigin(req.headers.get('referer'))

  const forwardedProto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    ((req.headers.get('x-forwarded-ssl') ?? '').toLowerCase() === 'on'
      ? 'https'
      : '')
  const forwardedHost =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    req.headers.get('host')?.split(',')[0]?.trim() ||
    ''

  const forwardedOrigin =
    forwardedHost && forwardedProto
      ? `${forwardedProto}://${forwardedHost}`
      : ''

  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    ''

  const base =
    browserOrigin ||
    forwardedOrigin ||
    configuredBaseUrl ||
    req.url ||
    'http://localhost:3080'

  return new URL('/login', base)
}

const isBrowserFormPost = (req: Request) => {
  const contentType = req.headers.get('content-type') || ''
  return (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  )
}

export const dynamic = 'force-dynamic'

export const POST = async (req: Request) => {
  const user = await getCurrentUser().catch(() => null)
  const token = await getSessionCookie()

  if (token) await deleteSession(token).catch(() => {})
  await clearSessionCookie()

  if (user) {
    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'USER_LOGOUT',
      entityType: 'user',
      entityId: user.id,
    }).catch(() => {})
  }

  if (isBrowserFormPost(req)) {
    return NextResponse.redirect(resolveLogoutRedirectTarget(req), {
      status: 303,
    })
  }

  return ok(true)
}
