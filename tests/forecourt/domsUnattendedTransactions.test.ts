import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildUnattendedClearPayload,
  extractJplUnattendedReceiptCapture,
  maskCardPan,
  redactJplSensitivePaymentData,
} from '../../src/modules/forecourt/infrastructure/jpl/unattendedTransactions'
import { buildClearUnsupervisedTransactionRequest } from '../../src/modules/forecourt/infrastructure/jpl/transactionService'

describe('DOMS/JPL unattended transaction receipt capture', () => {
  it('extracts receipt and external payment metadata from EPT receipt items', () => {
    const capture = extractJplUnattendedReceiptCapture({
      FpId: '02',
      TransSeqNo: '0017',
      Money_e: '0000004321',
      Vol_e: '0000001234',
      EptReceiptFormatId: '3',
      EptReceiptItems: {
        SelectedDeviceId: '02',
        EptId: '08',
        EptSeqNo: '0099',
        ReceiptNo: '1234',
        TillSequenceNumber: { TillType: '01H', TillSeqNo: '4567' },
        CardNumberPan: '4111111111111111',
        CardNamePan: 'TEST CARD',
        EptSeqValidationResult: { value: '00H' },
      },
    })

    assert.equal(capture.eptReceiptFormatId, '3')
    assert.equal(capture.eptId, '08')
    assert.equal(capture.eptSeqNo, '0099')
    assert.equal(capture.receiptNo, '1234')
    assert.equal(capture.tillType, '01H')
    assert.equal(capture.tillSeqNo, '4567')
    assert.equal(capture.cardLabel, 'TEST CARD')
    assert.equal(capture.cardPanMasked, '411111******1111')
    assert.equal(capture.externalPaymentReference, 'EPT:08|SEQ:0099|RCP:1234|DEV:02|TILL:4567')
    assert.equal(capture.hasReceiptData, true)
    assert.deepEqual(capture.warnings, [])
  })

  it('redacts sensitive card data while keeping useful receipt labels', () => {
    const redacted = redactJplSensitivePaymentData({
      CardNumberPan: '5555444433332222',
      CardNamePan: 'FLEET CARD',
      EncryptedTrack2: 'secret-track',
      nested: { pinBlock: '1234' },
    }) as any

    assert.equal(redacted.CardNumberPan, '555544******2222')
    assert.equal(redacted.CardNamePan, 'FLEET CARD')
    assert.equal(redacted.EncryptedTrack2, '[redacted]')
    assert.equal(redacted.nested.pinBlock, '[redacted]')
    assert.equal(maskCardPan('123'), '***')
  })

  it('builds SUBC 03 unattended clear payloads when receipt data is present', () => {
    const txData = {
      FpId: '02',
      TransSeqNo: '0017',
      Money_e: '0000004321',
      Vol_e: '0000001234',
      EptReceiptFormatId: '3',
      EptReceiptItems: {
        EptId: '08',
        EptSeqNo: '0099',
        ReceiptNo: '1234',
        CardNumberPan: '4111111111111111',
      },
    }
    const clearPayload = buildUnattendedClearPayload({ txData, posId: '04' })
    const request = buildClearUnsupervisedTransactionRequest({
      fpId: 2,
      posId: 4,
      transSeqNo: 17,
      txData,
      payload: clearPayload,
    })

    assert.equal(request.name, 'clear_FpUnSupTrans_req')
    assert.equal(request.subCode, '03H')
    assert.equal(request.data.FpId, '02')
    assert.equal(request.data.PosId, '04')
    assert.equal(request.data.TransSeqNo, '0017')
    assert.equal(request.data.EptReceiptFormatId, '03')
    assert.equal((request.data.EptReceiptItems as any).CardNumberPan, '4111111111111111')
    assert.equal(
      (clearPayload as any)._domsUnattendedReceiptCapture.cardPanMasked,
      '411111******1111',
    )
  })
})
