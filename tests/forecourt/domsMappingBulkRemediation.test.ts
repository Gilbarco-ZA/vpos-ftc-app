import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildBulkDomsMappingCsvTemplate,
  parseBulkDomsMappingInput,
} from '../../src/modules/forecourt/application/bulkDomsMappingRemediation'

describe('DOMS mapping bulk remediation parser', () => {
  it('parses CSV rows with headers into normalized mapping items', () => {
    const parsed = parseBulkDomsMappingInput({
      csvText:
        'entityType,entityId,domsFpId,domsTankId,domsGradeOptionId,domsGradeId,sourceSuggestionCode,note\n' +
        'pump,pump-1,1,,,,map-observed-fp,checked\n' +
        'tank,tank-1,,TK1,,,,checked\n' +
        'nozzle,nozzle-1,,TK1,2,G1,,checked',
    })

    assert.equal(parsed.blockers.length, 0)
    assert.equal(parsed.items.length, 3)
    assert.deepEqual(parsed.items[0].mapping, { domsFpId: '1' })
    assert.deepEqual(parsed.items[1].mapping, { domsTankId: 'TK1' })
    assert.deepEqual(parsed.items[2].mapping, {
      domsGradeOptionId: '2',
      domsGradeId: 'G1',
      domsTankId: 'TK1',
    })
  })

  it('parses JSON array rows and reports invalid rows without throwing', () => {
    const parsed = parseBulkDomsMappingInput({
      jsonText: JSON.stringify([
        { entityType: 'pump', entityId: 'pump-2', domsFpId: 2 },
        { entityType: 'bad', entityId: 'broken' },
      ]),
    })

    assert.equal(parsed.items.length, 1)
    assert.equal(parsed.blockers.length, 1)
    assert.equal(parsed.blockers[0].code, 'invalid-bulk-row')
  })

  it('provides a CSV template with the supported columns', () => {
    const template = buildBulkDomsMappingCsvTemplate()
    assert.match(template, /entityType,entityId,domsFpId/)
    assert.match(template, /pump,/)
    assert.match(template, /nozzle,/)
  })
})
