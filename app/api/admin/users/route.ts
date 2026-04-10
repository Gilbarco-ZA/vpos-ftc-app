import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { toBool } from '@/src/platform/web/api/validation'
import { createAuditLog } from '@/src/shared/audit/log'
import {
  createUser,
  setUserActive,
  updatePassword,
  updateUserProfile,
} from '@/src/shared/auth'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'
import { listUsers } from '@/src/shared/server/users'
import {
  createUserSchema,
  updateUserSchema,
} from '@/src/shared/validations/users'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const rows = await listUsers(user.stationId)
    return ok(rows)
  },
})

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['administrator'],
  handler: async (req, { user, body }) => {
    try {
      const parsed = createUserSchema.safeParse({
        stationId: user.stationId,
        username: body.username,
        email: body.email,
        password: body.password,
        role: body.role,
        fullName: body.fullName,
      })

      if (!parsed.success) {
        return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
      }

      const created = await createUser(parsed.data)

      await createAuditLog({
        stationId: user.stationId,
        userId: user.id,
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: created.id,
        newValues: {
          username: created.username,
          email: created.email,
          role: created.role,
        },
      }).catch(() => {})

      return ok(created)
    } catch (err: any) {
      return await serverError(err, { req, stationId: user.stationId })
    }
  },
})

export const PUT = defineMutationRoute<Record<string, any>>({
  roles: ['administrator'],
  handler: async (req, { user, body }) => {
    try {
      const userId = String(body.userId || '').trim()
      if (!userId) return fail('userId is required', 400)

      const hasProfileUpdate =
        body.username !== undefined ||
        body.email !== undefined ||
        body.role !== undefined ||
        body.fullName !== undefined

      if (hasProfileUpdate) {
        const parsed = updateUserSchema.safeParse({
          userId,
          username: body.username,
          email: body.email,
          role: body.role,
          fullName: body.fullName,
        })

        if (!parsed.success) {
          return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
        }

        const updated = await updateUserProfile({
          stationId: user.stationId,
          userId,
          username: parsed.data.username,
          email: parsed.data.email,
          role: parsed.data.role,
          fullName: parsed.data.fullName,
        })

        await createAuditLog({
          stationId: user.stationId,
          userId: user.id,
          action: 'USER_UPDATED',
          entityType: 'user',
          entityId: userId,
          newValues: {
            username: updated.username,
            email: updated.email,
            role: updated.role,
            fullName: updated.fullName,
          },
        }).catch(() => {})

        return ok(updated)
      }

      if (body.setActive !== undefined) {
        const isActive = toBool(body.setActive, true) === true
        await setUserActive(userId, isActive)
        await createAuditLog({
          stationId: user.stationId,
          userId: user.id,
          action: 'USER_UPDATED',
          entityType: 'user',
          entityId: userId,
          newValues: { isActive },
        }).catch(() => {})
      }

      if (body.newPassword) {
        await updatePassword(userId, String(body.newPassword))
        await createAuditLog({
          stationId: user.stationId,
          userId: user.id,
          action: 'USER_UPDATED',
          entityType: 'user',
          entityId: userId,
          newValues: { passwordReset: true },
        }).catch(() => {})
      }

      return ok(true)
    } catch (err: any) {
      return await serverError(err, { req, stationId: user.stationId })
    }
  },
})
