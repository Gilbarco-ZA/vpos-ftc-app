import type { SessionUser } from '@/src/shared/types'

import {
  deleteSecureArtifact,
  getSecureArtifact,
  listSecureArtifacts,
  upsertSecureArtifact,
} from '@/src/platform/security/secure-artifacts'
import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { safeAsync } from '@/src/shared/utils/safeAsync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const asString = (v: unknown) => (typeof v === 'string' ? v : '')

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }

    const url = new URL(req.url)
    const artifactType = url.searchParams.get('type') || ''
    const artifactKey = url.searchParams.get('key') || ''
    const includePayload = url.searchParams.get('include_payload') === 'true'

    if (artifactType && artifactKey && includePayload) {
      const row = await getSecureArtifact(
        user.stationId,
        artifactType,
        artifactKey,
      )
      if (!row) return fail('Not found', 404)
      return ok({
        id: row.id,
        artifactType: row.artifactType,
        artifactKey: row.artifactKey,
        metadataJson: row.metadataJson,
        createdAt: row.createdAt,
        payload_base64: row.payload.toString('base64'),
      })
    }

    const rows = await listSecureArtifacts(user.stationId)
    const filtered = artifactType
      ? rows.filter((r) => r.artifactType === artifactType)
      : rows

    return ok(
      filtered.map((r) => ({
        id: r.id,
        artifactType: r.artifactType,
        artifactKey: r.artifactKey,
        encAlg: r.encAlg,
        encVersion: r.encVersion,
        keyId: r.keyId,
        metadataJson: r.metadataJson,
        createdAt: r.createdAt,
        rotatedAt: r.rotatedAt,
        deletedAt: r.deletedAt,
      })),
    )
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }

    const body = await safeAsync(req.json(), 'secureArtifacts.parseBody')
    const artifactType = asString(
      body?.artifact_type || body?.artifactType,
    ).trim()
    const artifactKey = asString(body?.artifact_key || body?.artifactKey).trim()

    const payloadBase64 = asString(body?.payload_base64).trim()
    const payloadText = asString(body?.payload_text)
    const metadataJson =
      typeof body?.metadata_json === 'object' && body?.metadata_json !== null
        ? (body.metadata_json as Record<string, unknown>)
        : typeof body?.metadataJson === 'object' && body?.metadataJson !== null
          ? (body.metadataJson as Record<string, unknown>)
          : {}

    if (!artifactType) return fail('artifact_type required', 400)
    if (!artifactKey) return fail('artifact_key required', 400)

    let payload: Buffer
    if (payloadBase64) {
      try {
        payload = Buffer.from(payloadBase64, 'base64')
      } catch {
        return fail('payload_base64 must be valid base64', 400)
      }
    } else if (payloadText) {
      payload = Buffer.from(payloadText, 'utf-8')
    } else {
      return fail('payload_base64 or payload_text required', 400)
    }

    const res = await upsertSecureArtifact({
      stationId: user.stationId,
      artifactType,
      artifactKey,
      payload,
      metadataJson,
    })

    return ok({ success: true, id: res.id, createdAt: res.createdAt })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}

export const DELETE = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }

    const url = new URL(req.url)
    const artifactType = url.searchParams.get('type') || ''
    const artifactKey = url.searchParams.get('key') || ''
    if (!artifactType || !artifactKey)
      return fail('type and key are required', 400)

    await deleteSecureArtifact(user.stationId, artifactType, artifactKey)
    return ok({ success: true })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
