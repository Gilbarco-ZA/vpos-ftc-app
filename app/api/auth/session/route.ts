import { ok, serverError } from '@/src/platform/web/api/response'
import { getCurrentUser } from '@/src/shared/auth'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  try {
    const user = await getCurrentUser()
    return ok(user)
  } catch (error) {
    return await serverError(error)
  }
}
