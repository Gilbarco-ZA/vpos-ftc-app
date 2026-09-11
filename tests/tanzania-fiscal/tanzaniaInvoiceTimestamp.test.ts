import assert from 'node:assert/strict'
import test from 'node:test'

import {
  dateParts,
  isoDateTimeInTimezone,
} from '../../src/modules/tanzania-fiscal/infrastructure/xml'
import {
  deviceLocalTimezone,
  resolveLocalTimezone,
} from '../../src/modules/tanzania-fiscal/infrastructure/timezone'

test('formats fiscal timestamps using the supplied Site Profile timezone override without an offset', () => {
  assert.equal(
    isoDateTimeInTimezone(
      '2026-08-11T10:04:16.649Z',
      'Africa/Dar_es_Salaam',
    ),
    '2026-08-11T13:04:16.649',
  )
  assert.equal(
    dateParts('2026-08-11T10:04:16.649Z', 'Africa/Dar_es_Salaam').time,
    '13:04:16',
  )
})

test('a configured Site Profile timezone overrides the device local timezone', () => {
  assert.equal(resolveLocalTimezone('Africa/Dar_es_Salaam'), 'Africa/Dar_es_Salaam')
  assert.equal(
    isoDateTimeInTimezone(
      '2026-09-11T10:30:34.000Z',
      'Africa/Johannesburg',
    ),
    '2026-09-11T12:30:34.000',
  )
})

test('an unset Site Profile timezone falls back to the device/runtime timezone', () => {
  assert.equal(resolveLocalTimezone(undefined), deviceLocalTimezone())
  assert.equal(resolveLocalTimezone(''), deviceLocalTimezone())
})

test('invalid Site Profile timezone overrides are rejected', () => {
  assert.throws(
    () => resolveLocalTimezone('Not/A_Real_Timezone'),
    /Invalid site timezone override/,
  )
})
