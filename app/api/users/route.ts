import type { SessionUser, UserRole } from '@/src/shared/types'

import { readBody, toBool } from '@/src/platform/web/api/request'
import { fail, ok, serverError } from '@/src/platform/web/api/response'
import {
  createUser,
  requireAuth,
  setUserActive,
  updatePassword,
} from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'
import { listUsers, userExists } from '@/src/shared/server/users'

import { updateUserMetadata } from '@/src/modules/users/application/manageUsers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }

    const rows = await listUsers(user.stationId)

    // Match vpos-console: { data: [...] }
    return ok({ data: rows })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const body = await readBody(req)

    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })

    const username = String(body.username || '').trim()
    const email = String(body.email || '').trim()
    const password = String(body.password || '').trim()
    const role = String(body.role || '').trim() as UserRole
    const fullName = body.fullName ? String(body.fullName).trim() : undefined

    if (!username || !email || !password || !role) {
      return fail('username, email, password and role are required', 400)
    }

    const created = await createUser({
      stationId: user.stationId,
      username,
      email,
      password,
      role,
      fullName,
    })

    // vpos-console typically returns created user in { data: ... }
    return ok({ data: created })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const PATCH = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const body = await readBody(req)

    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })

    // vpos-console PATCH /api/users expects user id in body
    const userId = String(body.userId || body.id || '').trim()
    if (!userId) {
      return fail('userId is required', 400)
    }

    // Ensure user belongs to this station
    const existing = await userExists(userId, user.stationId)
    if (!existing) {
      return fail('User not found', 404)
    }

    if (
      body.setActive !== undefined ||
      body.isActive !== undefined ||
      body.active !== undefined
    ) {
      const flag =
        body.setActive !== undefined
          ? body.setActive
          : body.isActive !== undefined
            ? body.isActive
            : body.active
      await setUserActive(userId, toBool(flag, true) === true)
    }

    if (body.newPassword || body.password) {
      const pwd = String(body.newPassword || body.password || '').trim()
      if (pwd) await updatePassword(userId, pwd)
    }

    // Allow limited metadata updates commonly used by console
    if (body.role || body.fullName || body.email || body.username) {
      const nextRole = body.role ? String(body.role).trim() : undefined
      const nextFullName = body.fullName
        ? String(body.fullName).trim()
        : undefined
      const nextEmail = body.email ? String(body.email).trim() : undefined
      const nextUsername = body.username
        ? String(body.username).trim()
        : undefined

      await updateUserMetadata({
        stationId: user.stationId,
        userId,
        role: nextRole,
        fullName: nextFullName,
        email: nextEmail,
        username: nextUsername,
      })
    }

    return ok({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
