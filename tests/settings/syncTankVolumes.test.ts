import assert from 'node:assert/strict'
import test from 'node:test'

import { syncTankVolumes } from '@/src/modules/settings/application/syncTankVolumes'

const liveData = {
  requestedTgIds: ['01', '02', '03', '04'],
  responses: [{ tgId: '01' }],
  normalized: [{ tgId: '01', tankGrossObservedVol: 1330 }],
  errors: [],
}

const config = {
  grades: ['G4', 'G2'],
  gradeLimits: [null, null],
  tanks: ['G4', 'G2', 'G2', 'G4'],
  activeTanks: [true, true, false, false],
  tankLevels: [100, 200, 300, 400],
}

test('manual tank sync uses the ATG capture path and updates /tanks levels by TgId', async () => {
  const calls: string[] = []
  const saved: unknown[] = []

  const result = await syncTankVolumes('station-1', {
    captureAtgSnapshot: async (stationId) => {
      calls.push(stationId)
      return {
        ok: true as const,
        recordedAt: '2026-08-11T10:25:58.000Z',
        requestedTgIds: ['01', '02', '03', '04'],
        controllerErrors: [],
        updated: 4,
        snapshotsSaved: 4,
        tanks: [
          {
            tankId: 'tank-1',
            tgId: '01',
            gross: 1330,
            water: 20,
            updatedAt: '2026-08-11T10:25:58.000Z',
          },
          {
            tankId: 'tank-2',
            tgId: '02',
            gross: 9980,
            water: 20,
            updatedAt: '2026-08-11T10:25:58.000Z',
          },
          {
            tankId: 'tank-3',
            tgId: '03',
            gross: 11480,
            water: 20,
            updatedAt: '2026-08-11T10:25:58.000Z',
          },
          {
            tankId: 'tank-4',
            tgId: '04',
            gross: 11180,
            water: 20,
            updatedAt: '2026-08-11T10:25:58.000Z',
          },
        ],
        liveData,
      }
    },
    getTankConfig: async () => config,
    saveTankConfig: async (_stationId, value) => {
      saved.push(value)
    },
  })

  assert.deepEqual(calls, ['station-1'])
  assert.deepEqual(result.synced, {
    count: 4,
    requested: 4,
    controllerErrors: [],
    tankLevelUpdates: 4,
  })
  assert.deepEqual(result.config.tankLevels, [1330, 9980, 11480, 11180])
  assert.deepEqual(result.capture, {
    recordedAt: '2026-08-11T10:25:58.000Z',
    requestedTgIds: ['01', '02', '03', '04'],
    snapshotsSaved: 4,
  })
  assert.equal(saved.length, 1)
  assert.deepEqual(result.liveData, liveData)
})

test('manual tank sync surfaces partial controller reads without discarding successful tanks', async () => {
  const result = await syncTankVolumes('station-1', {
    captureAtgSnapshot: async () => ({
      ok: true as const,
      recordedAt: '2026-08-11T10:25:58.000Z',
      requestedTgIds: ['01', '02', '03', '04'],
      controllerErrors: [{ tgId: '04', error: 'timeout' }],
      updated: 3,
      snapshotsSaved: 3,
      tanks: [
        {
          tankId: 'tank-1',
          tgId: '01',
          gross: 1330,
          water: 20,
          updatedAt: '2026-08-11T10:25:58.000Z',
        },
      ],
      liveData: {
        requestedTgIds: ['01', '02', '03', '04'],
        responses: [],
        normalized: [],
        errors: [{ tgId: '04', error: 'timeout' }],
      },
    }),
    getTankConfig: async () => config,
    saveTankConfig: async () => {},
  })

  assert.equal(result.synced.count, 3)
  assert.equal(result.synced.requested, 4)
  assert.equal(result.synced.tankLevelUpdates, 1)
  assert.deepEqual(result.synced.controllerErrors, [
    { tgId: '04', error: 'timeout' },
  ])
  assert.equal(result.config.tankLevels?.[0], 1330)
})

test('manual tank sync does not create new /tanks topology for unknown gauge ids', async () => {
  let saves = 0
  const result = await syncTankVolumes('station-1', {
    captureAtgSnapshot: async () => ({
      ok: true as const,
      recordedAt: '2026-08-11T10:25:58.000Z',
      requestedTgIds: ['05'],
      controllerErrors: [],
      updated: 1,
      snapshotsSaved: 1,
      tanks: [
        {
          tankId: 'tank-5',
          tgId: '05',
          gross: 5000,
          water: 0,
          updatedAt: '2026-08-11T10:25:58.000Z',
        },
      ],
      liveData: {
        requestedTgIds: ['05'],
        responses: [],
        normalized: [],
        errors: [],
      },
    }),
    getTankConfig: async () => config,
    saveTankConfig: async () => {
      saves += 1
    },
  })

  assert.equal(result.synced.tankLevelUpdates, 0)
  assert.equal(saves, 0)
  assert.deepEqual(result.config.tankLevels, config.tankLevels)
})

test('manual tank sync stays inert without a station id', async () => {
  let captures = 0
  const result = await syncTankVolumes('', {
    captureAtgSnapshot: async () => {
      captures += 1
      throw new Error('should not be called')
    },
  })

  assert.equal(captures, 0)
  assert.deepEqual(result.capture, {
    recordedAt: '',
    requestedTgIds: [],
    snapshotsSaved: 0,
  })
  assert.deepEqual(result.synced, {
    count: 0,
    requested: 0,
    controllerErrors: [],
  })
  assert.deepEqual(result.tanks, [])
  assert.deepEqual(result.config, {
    grades: [],
    gradeLimits: [],
    tanks: [],
    activeTanks: [],
    tankLevels: [],
  })
})
