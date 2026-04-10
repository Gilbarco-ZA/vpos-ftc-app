import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'

import {
  getJplBufferHealth,
  setJplBufferHealth,
} from '@/src/shared/forecourt/adapters/jplTcpGlobals'

const getBucket = (mode: BufferMode) => {
  const state = getJplBufferHealth()
  return {
    state,
    bucket: mode === 'supervised' ? state.supervised : state.unsupervised,
  }
}

const ensurePumpHealth = (mode: BufferMode, fpId: number) => {
  const { state, bucket } = getBucket(mode)
  const pumpKey = String(Number(fpId))
  const existing = bucket[pumpKey] ?? {
    pumpId: Number(fpId),
    depth: 0,
    lastSeqNo: null,
    lastStatusAt: null,
    lastReadAt: null,
    lastClearAt: null,
  }

  return { state, bucket, pumpKey, existing }
}

const persistBufferHealth = (
  updatedAt: number,
  state: ReturnType<typeof getJplBufferHealth>,
) => {
  setJplBufferHealth({
    updatedAt,
    supervised: state.supervised,
    unsupervised: state.unsupervised,
  })
}

export const updateBufferHealthFromPointerList = (
  mode: BufferMode,
  fpId: number | null | undefined,
  entries: Array<{ transSeqNo: number | null }>,
) => {
  if (fpId == null || !Number.isFinite(Number(fpId))) return

  const { state, bucket, pumpKey, existing } = ensurePumpHealth(
    mode,
    Number(fpId),
  )
  const seqs = entries
    .map((e) => (e?.transSeqNo != null ? Number(e.transSeqNo) : NaN))
    .filter((n) => Number.isFinite(n))

  bucket[pumpKey] = {
    ...existing,
    depth: entries.length,
    lastSeqNo: seqs.length ? Math.max(...seqs) : null,
    lastStatusAt: Date.now(),
  }

  state.updatedAt = Date.now()
  persistBufferHealth(state.updatedAt, state)
}

export const markBufferRead = (
  mode: BufferMode,
  fpId: number,
  transSeqNo?: number | null,
) => {
  const { state, bucket, pumpKey, existing } = ensurePumpHealth(mode, fpId)
  bucket[pumpKey] = {
    ...existing,
    lastReadAt: Date.now(),
    lastSeqNo:
      transSeqNo != null && Number.isFinite(Number(transSeqNo))
        ? Math.max(existing.lastSeqNo ?? 0, Number(transSeqNo))
        : existing.lastSeqNo,
  }
  state.updatedAt = Date.now()
  persistBufferHealth(state.updatedAt, state)
}

export const markBufferCleared = (
  mode: BufferMode,
  fpId: number,
  transSeqNo?: number | null,
) => {
  const { state, bucket, pumpKey, existing } = ensurePumpHealth(mode, fpId)
  bucket[pumpKey] = {
    ...existing,
    lastClearAt: Date.now(),
    lastSeqNo:
      transSeqNo != null && Number.isFinite(Number(transSeqNo))
        ? Math.max(existing.lastSeqNo ?? 0, Number(transSeqNo))
        : existing.lastSeqNo,
  }
  state.updatedAt = Date.now()
  persistBufferHealth(state.updatedAt, state)
}

export const markBufferError = (mode: BufferMode, fpId: number, err: any) => {
  const { state, bucket, pumpKey, existing } = ensurePumpHealth(mode, fpId)
  bucket[pumpKey] = {
    ...existing,
    lastError: err?.message || String(err),
  }
  state.updatedAt = Date.now()
  persistBufferHealth(state.updatedAt, state)
}
