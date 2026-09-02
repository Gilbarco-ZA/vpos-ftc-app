import assert from 'node:assert/strict'
import test from 'node:test'

import { isoDateTimeInTimezone } from '../../src/modules/tanzania-fiscal/infrastructure/xml'

test('formats Tanzania invoice timestamps with the station UTC offset', () => {
  assert.equal(
    isoDateTimeInTimezone(
      '2026-08-11T10:04:16.649Z',
      'Africa/Dar_es_Salaam',
    ),
    '2026-08-11T13:04:16.649+03:00',
  )
})
