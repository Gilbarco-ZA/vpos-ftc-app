import assert from 'node:assert/strict'
import test from 'node:test'

import {
  dateParts,
  isoDateTimeInTimezone,
} from '../../src/modules/tanzania-fiscal/infrastructure/xml'

test('formats Tanzania invoice timestamps as EAT wall-clock time without an offset', () => {
  assert.equal(
    isoDateTimeInTimezone(
      '2026-08-11T10:04:16.649Z',
      'Africa/Dar_es_Salaam',
    ),
    '2026-08-11T13:04:16.649',
  )
})

test('Tanzania fiscal timestamps ignore a stale South African station timezone', () => {
  assert.equal(
    isoDateTimeInTimezone(
      '2026-09-11T10:30:34.000Z',
      'Africa/Johannesburg',
    ),
    '2026-09-11T13:30:34.000',
  )
  assert.equal(
    dateParts('2026-09-11T10:30:34.000Z', 'Africa/Johannesburg').time,
    '13:30:34',
  )
})
