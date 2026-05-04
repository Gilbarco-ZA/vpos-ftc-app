import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { query } from '@/src/platform/db/postgres'
import { serverError } from '@/src/platform/web/api/response'
import { deleteUserSessions, requireAuth } from '@/src/shared/auth'
import { getUserById, userExists } from '@/src/shared/server/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const id = String((await ctx.params).id || '').trim()
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 },
      )
    }

    const row = await getUserById(id, user.stationId)

    if (!row) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ data: row })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const DELETE = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const id = String((await ctx.params).id || '').trim()
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 },
      )
    }

    // Soft-delete to match existing schema patterns
    const row = await userExists(id, user.stationId)
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      )
    }

    await query(
      `UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    )
    await deleteUserSessions(id).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
