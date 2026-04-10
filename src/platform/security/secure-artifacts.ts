import * as crypto from 'node:crypto'

import { query, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

const MASTER_KEY_ENV = 'SECURE_ARTIFACTS_MASTER_KEY'

const readMasterKey = (): Buffer => {
  const raw = (process.env[MASTER_KEY_ENV] || '').trim()
  if (!raw) {
    throw new Error(
      `${MASTER_KEY_ENV} is required to encrypt/decrypt secure artifacts (expected 32-byte key as hex or base64).`,
    )
  }

  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    try {
      key = Buffer.from(raw, 'base64')
    } catch {
      key = Buffer.alloc(0)
    }
  }

  if (key.length !== 32) {
    throw new Error(
      `${MASTER_KEY_ENV} must be 32 bytes (got ${key.length}). Provide 64-char hex or base64 encoding of 32 bytes.`,
    )
  }

  return key
}

const ALG = 'aes-256-gcm' as const

const randomIv = (): Buffer => {
  const u8 = crypto.webcrypto.getRandomValues(new Uint8Array(12))
  return Buffer.from(u8)
}

const encrypt = (
  plaintext: Buffer,
): { iv: Buffer; authTag: Buffer; ciphertext: Buffer } => {
  const key = readMasterKey()
  const iv = randomIv()
  const cipher = (crypto.createCipheriv as any)(ALG, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { iv, authTag, ciphertext }
}

const decrypt = (iv: Buffer, authTag: Buffer, ciphertext: Buffer): Buffer => {
  const key = readMasterKey()
  const decipher = crypto.createDecipheriv(ALG, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export const listSecureArtifacts = async (stationId: string) => {
  const res = await query(
    `SELECT id, station_id, artifact_type, artifact_key, enc_alg, enc_version, key_id,
            metadata_json, created_at, rotated_at, deleted_at
     FROM secure_artifacts
     WHERE station_id = $1
       AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [stationId],
  )

  return res.rows.map((r: any) => ({
    id: r.id,
    stationId: r.station_id,
    artifactType: r.artifact_type,
    artifactKey: r.artifact_key,
    encAlg: r.enc_alg,
    encVersion: r.enc_version,
    keyId: r.key_id,
    metadataJson: r.metadata_json || {},
    createdAt: new Date(r.created_at),
    rotatedAt: r.rotated_at ? new Date(r.rotated_at) : null,
    deletedAt: r.deleted_at ? new Date(r.deleted_at) : null,
  }))
}

export const getSecureArtifact = async (
  stationId: string,
  artifactType: string,
  artifactKey: string,
) => {
  const row = await queryOne<any>(
    `SELECT id, station_id, artifact_type, artifact_key, enc_alg, enc_version, key_id,
            iv, auth_tag, ciphertext, metadata_json, created_at, rotated_at, deleted_at
     FROM secure_artifacts
     WHERE station_id = $1
       AND artifact_type = $2
       AND artifact_key = $3
       AND rotated_at IS NULL
       AND deleted_at IS NULL
     LIMIT 1`,
    [stationId, artifactType, artifactKey],
  )

  if (!row) return null

  const plaintext = decrypt(
    row.iv as Buffer,
    row.auth_tag as Buffer,
    row.ciphertext as Buffer,
  )

  return {
    id: row.id as string,
    stationId: row.station_id as string,
    artifactType: row.artifact_type as string,
    artifactKey: row.artifact_key as string,
    metadataJson: (row.metadata_json || {}) as Record<string, unknown>,
    payload: plaintext,
    createdAt: new Date(row.created_at as string),
  }
}

export const getSecureArtifactPayload = async (
  stationId: string,
  artifactType: string,
  artifactKey: string,
) => {
  const artifact = await getSecureArtifact(stationId, artifactType, artifactKey)
  if (!artifact) throw new Error('Secure artifact not found')
  return artifact.payload as Buffer
}

export const upsertSecureArtifact = async (args: {
  stationId: string
  artifactType: string
  artifactKey: string
  payload: Buffer
  metadataJson?: Record<string, unknown>
  keyId?: string | null
}) => {
  const { stationId, artifactType, artifactKey, payload, metadataJson, keyId } =
    args
  const { iv, authTag, ciphertext } = encrypt(payload)

  await query(
    `UPDATE secure_artifacts
     SET rotated_at = NOW()
     WHERE station_id = $1
       AND artifact_type = $2
       AND artifact_key = $3
       AND rotated_at IS NULL
       AND deleted_at IS NULL`,
    [stationId, artifactType, artifactKey],
  )

  const inserted = await queryOne<any>(
    `INSERT INTO secure_artifacts (id, station_id, artifact_type, artifact_key, key_id, iv, auth_tag, ciphertext, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, created_at`,
    [
      uuidv4(),
      stationId,
      artifactType,
      artifactKey,
      keyId || null,
      iv,
      authTag,
      ciphertext,
      metadataJson || {},
    ],
  )

  return {
    id: inserted?.id as string,
    createdAt: inserted?.created_at
      ? new Date(inserted.created_at as string)
      : new Date(),
  }
}

export const deleteSecureArtifact = async (
  stationId: string,
  artifactType: string,
  artifactKey: string,
) => {
  await query(
    `UPDATE secure_artifacts
     SET deleted_at = NOW()
     WHERE station_id = $1
       AND artifact_type = $2
       AND artifact_key = $3
       AND rotated_at IS NULL
       AND deleted_at IS NULL`,
    [stationId, artifactType, artifactKey],
  )
}
