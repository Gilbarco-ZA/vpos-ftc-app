import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDomsFirstSiteAcceptancePack } from '../../src/modules/forecourt/application/domsFirstSiteAcceptancePack'

const readiness = {
  generatedAt: '2026-07-13T08:00:00.000Z',
  overallStatus: 'pending',
  productionReleaseStatus: 'blocked',
  summary: { blockingItemCount: 1, checkpointCount: 2 },
  checklist: [
    {
      id: 'jpl-live-connection-observed',
      area: 'jpl-hardware',
      status: 'pending',
      title: 'Live JPL connection observed',
      description: 'Connect and complete logon against the target PSS.',
      nextAction: 'Run live validation.',
      blocksProduction: true,
      manualValidationRequired: true,
    },
    {
      id: 'non-blocking-note',
      area: 'operations',
      status: 'passed',
      title: 'Optional note',
      description: 'Optional informational check.',
      nextAction: 'None.',
      blocksProduction: false,
      manualValidationRequired: false,
    },
  ],
} as any

test('builds a deterministic first-site acceptance pack from release-gate checkpoints', () => {
  const first = buildDomsFirstSiteAcceptancePack({
    stationId: 'site-01',
    readiness,
    generatedAt: '2026-07-13T08:05:00.000Z',
  })
  const second = buildDomsFirstSiteAcceptancePack({
    stationId: 'site-01',
    readiness,
    generatedAt: '2026-07-13T09:05:00.000Z',
  })

  assert.equal(first.acceptanceDigest, second.acceptanceDigest)
  assert.equal(first.acceptanceDefinition.criteria.length, 1)
  assert.equal(
    first.acceptanceDefinition.criteria[0]?.sourceCheckpointId,
    'jpl-live-connection-observed',
  )
  assert.equal(first.signOffTemplate.acceptanceDigest, first.acceptanceDigest)
})

test('changes the digest when acceptance criteria change', () => {
  const first = buildDomsFirstSiteAcceptancePack({
    stationId: 'site-01',
    readiness,
  })
  const changed = buildDomsFirstSiteAcceptancePack({
    stationId: 'site-01',
    readiness: {
      ...readiness,
      checklist: readiness.checklist.map((item: any) =>
        item.id === 'jpl-live-connection-observed'
          ? { ...item, description: 'Changed acceptance requirement.' }
          : item,
      ),
    } as any,
  })

  assert.notEqual(first.acceptanceDigest, changed.acceptanceDigest)
})

test('does not include informational checks that are neither blocking nor manual', () => {
  const pack = buildDomsFirstSiteAcceptancePack({
    stationId: 'site-01',
    readiness,
  })

  assert.equal(
    pack.acceptanceDefinition.criteria.some(
      (criterion) => criterion.sourceCheckpointId === 'non-blocking-note',
    ),
    false,
  )
})
