import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  normalizeJplCode1,
  normalizeJplCode2,
  normalizeJplDec10,
  normalizeJplDec2,
  normalizeJplDec2OrZero,
  normalizeJplDec4,
  normalizeJplDec6,
  normalizeJplFcDateTime,
  normalizeJplFixedDecimal,
  normalizeJplId2,
  normalizeJplId2OrZero,
} from '../../src/modules/forecourt/infrastructure/jpl/protocol/types'

describe('DOMS/JPL fixed-width numeric normalization', () => {
  it('pads canonical ID and decimal values to their protocol widths', () => {
    assert.equal(normalizeJplId2(7), '07')
    assert.equal(normalizeJplId2OrZero(0), '00')
    assert.equal(normalizeJplDec2(9), '09')
    assert.equal(normalizeJplDec2OrZero(0), 0)
    assert.equal(normalizeJplDec4(17), '0017')
    assert.equal(normalizeJplDec6('4321'), '004321')
    assert.equal(normalizeJplDec10('2500'), '0000002500')
  })

  it('preserves legal leading zeroes without numeric coercion', () => {
    assert.equal(normalizeJplDec4('0017'), '0017')
    assert.equal(normalizeJplDec6('000000'), '000000')
    assert.equal(normalizeJplDec10('0000002500'), '0000002500')
  })

  it('rejects signs, decimal points, over-width values, and missing values', () => {
    assert.throws(() => normalizeJplDec4('-1'), /numeric value/i)
    assert.throws(() => normalizeJplDec4('1.5'), /numeric value/i)
    assert.throws(() => normalizeJplDec4('10000'), /at most 4 digits/i)
    assert.throws(() => normalizeJplDec6('1000000'), /at most 6 digits/i)
    assert.throws(() => normalizeJplDec10('10000000000'), /at most 10 digits/i)
    assert.throws(() => normalizeJplDec4(undefined), /numeric value/i)
    assert.throws(() => normalizeJplFixedDecimal('1', 0), /positive integer/i)
  })

  it('keeps CODE1, CODE2, and controller date-time fields canonical', () => {
    assert.equal(normalizeJplCode1('2'), '02H')
    assert.equal(normalizeJplCode1('0x0a'), '0AH')
    assert.equal(normalizeJplCode2('0x101'), '0101H')
    assert.equal(normalizeJplFcDateTime('20260710123045'), '20260710123045')
    assert.throws(
      () => normalizeJplFcDateTime('2026-07-10T12:30:45'),
      /14 digit string/i,
    )
  })
})
