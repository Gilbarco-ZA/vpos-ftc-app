import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type {
  DomsBackOfficeRecord,
  DomsServiceMessageRecord,
} from '@/src/modules/forecourt/infrastructure/jpl/specialRecords'
import type { SpecialRecordPersistenceDeps } from '@/src/platform/integrations/jpl/specialRecordPersistence'

import {
  persistCollectedBackOfficeRecord,
  persistCollectedServiceMessage,
} from '@/src/platform/integrations/jpl/specialRecordPersistence'

const createDeps = () => {
  const serviceRecords: any[] = []
  const backOfficeRecords: any[] = []
  const warnings: Array<{ message: string; details: Record<string, unknown> }> = []

  const deps: Partial<SpecialRecordPersistenceDeps> = {
    repository: {
      upsertServiceMessage: async (record: DomsServiceMessageRecord) => {
        serviceRecords.push(record)
      },
      upsertBackOfficeRecord: async (record: DomsBackOfficeRecord) => {
        backOfficeRecords.push(record)
      },
    } as any,
    warn: (message, details) => warnings.push({ message, details }),
  }

  return { deps, serviceRecords, backOfficeRecords, warnings }
}

describe('JPL special-record persistence', () => {
  it('skips service responses without a usable sequence number', async () => {
    const state = createDeps()
    const missing = await persistCollectedServiceMessage(
      'station-1',
      { data: { FcServiceMsg: 'ready' } },
      state.deps,
    )
    const blank = await persistCollectedServiceMessage(
      'station-1',
      { data: { FcServiceMsgSeqNo: '   ', FcServiceMsg: 'ready' } },
      state.deps,
    )

    assert.deepEqual(missing, {
      status: 'skipped',
      reason: 'missing-sequence',
    })
    assert.deepEqual(blank, {
      status: 'skipped',
      reason: 'missing-sequence',
    })
    assert.equal(state.serviceRecords.length, 0)
  })

  it('normalizes and persists service-message envelopes', async () => {
    const state = createDeps()
    const result = await persistCollectedServiceMessage(
      'station-1',
      {
        payload: {
          data: {
            FcServiceMsgSeqNo: '07',
            FcServiceMsg: 'controller ready   ',
          },
        },
      },
      state.deps,
    )

    assert.equal(result.status, 'persisted')
    assert.equal(state.serviceRecords.length, 1)
    assert.equal(state.serviceRecords[0].seqNo, '07')
    assert.equal(state.serviceRecords[0].message, 'controller ready')
    assert.equal(state.serviceRecords[0].stationId, 'station-1')
  })

  it('contains service-message persistence failures and emits bounded diagnostics', async () => {
    const state = createDeps()
    state.deps.repository = {
      ...state.deps.repository,
      upsertServiceMessage: async () => {
        throw new Error('database unavailable')
      },
    } as any

    const result = await persistCollectedServiceMessage(
      'station-1',
      { FcServiceMsgSeqNo: '08', FcServiceMsg: 'warning' },
      state.deps,
    )

    assert.equal(result.status, 'failed')
    if (result.status === 'failed') assert.equal(result.error, 'database unavailable')
    assert.equal(state.warnings.length, 1)
    assert.equal(state.warnings[0].message, '[jpl]')
    assert.deepEqual(state.warnings[0].details.error, {
      name: 'Error',
      message: 'database unavailable',
    })
    assert.equal('stack' in (state.warnings[0].details.error as object), false)
  })


  it('uses the default logger without exposing stack traces', async () => {
    const originalWarn = console.warn
    const originalLevel = process.env.LOG_LEVEL
    const logs: unknown[][] = []
    console.warn = (...args: unknown[]) => logs.push(args)
    process.env.LOG_LEVEL = 'warn'

    try {
      const result = await persistCollectedServiceMessage(
        'station-1',
        { FcServiceMsgSeqNo: '09', FcServiceMsg: 'warning' },
        {
          repository: {
            upsertServiceMessage: async () => {
              throw new Error('write unavailable')
            },
            upsertBackOfficeRecord: async () => undefined,
          } as any,
        },
      )

      assert.equal(result.status, 'failed')
      assert.equal(logs.length, 1)
      assert.equal(String(logs[0][0]).includes('write unavailable'), true)
      assert.equal(String(logs[0][0]).includes('stack'), false)
    } finally {
      console.warn = originalWarn
      if (originalLevel == null) delete process.env.LOG_LEVEL
      else process.env.LOG_LEVEL = originalLevel
    }
  })

  it('skips empty and missing-sequence back-office records', async () => {
    const state = createDeps()
    const empty = await persistCollectedBackOfficeRecord(
      'station-1',
      { data: { BorSeqNo: '12', BorLength: 0 } },
      '01H',
      state.deps,
    )
    const missing = await persistCollectedBackOfficeRecord(
      'station-1',
      { data: { BorData: '<record />' } },
      '02H',
      state.deps,
    )

    assert.deepEqual(empty, { status: 'skipped', reason: 'empty-record' })
    assert.deepEqual(missing, {
      status: 'skipped',
      reason: 'missing-sequence',
    })
    assert.equal(state.backOfficeRecords.length, 0)
  })

  it('persists non-empty back-office records and contains repository failures', async () => {
    const state = createDeps()
    const persisted = await persistCollectedBackOfficeRecord(
      'station-1',
      {
        payload: {
          BorSeqNo: '13',
          BorFormatId: { value: '51' },
          BorData: '<record />',
        },
      },
      '02H',
      state.deps,
    )

    assert.equal(persisted.status, 'persisted')
    assert.equal(state.backOfficeRecords[0].seqNo, '13')
    assert.equal(state.backOfficeRecords[0].formatId, '51')
    assert.equal(state.backOfficeRecords[0].borData, '<record />')

    state.deps.repository = {
      ...state.deps.repository,
      upsertBackOfficeRecord: async () => {
        throw 'write failed'
      },
    } as any
    const failed = await persistCollectedBackOfficeRecord(
      'station-1',
      { BorSeqNo: '14', BorData: '<next />' },
      '02H',
      state.deps,
    )

    assert.equal(failed.status, 'failed')
    if (failed.status === 'failed') assert.equal(failed.error, 'write failed')
    assert.equal(state.warnings.at(-1)?.details.borSeqNo, '14')
  })
})
