import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildCommandVariant,
  getProtocolErrorText,
  getProtocolRejectDetails,
  isUnknownSubCodeError,
  requestWithSubCodeFallback,
  requestWithTimeout,
} from '@/src/platform/integrations/jpl/protocol/runtime'

describe('JPL protocol runtime helpers', () => {
  it('prepares requests and reports timeouts', async () => {
    let outbound: any
    const response = await requestWithTimeout(
      {
        request: async (message: any) => {
          outbound = message
          return { ok: true }
        },
      },
      { name: 'Echo_req', subCode: '00H', data: {} },
      100,
      'timeout',
    )
    assert.equal(response.ok, true)
    assert.equal(outbound.name, 'Echo_req')

    await assert.rejects(
      requestWithTimeout(
        { request: async () => await new Promise(() => undefined) },
        { name: 'Echo_req', subCode: '00H', data: {} },
        1,
        'timed out',
      ),
      /timed out/,
    )
  })

  it('falls back only for unknown subcodes', async () => {
    const seen: string[] = []
    const response = await requestWithSubCodeFallback(
      {
        request: async (message: any) => {
          seen.push(message.subCode)
          if (message.subCode === '01H') {
            throw new Error(
              'Example_req subCode "01h" unknown message; closest matching',
            )
          }
          return { ok: true }
        },
      },
      {
        name: 'Example_req',
        variants: [
          { subCode: '01H', data: {} },
          { subCode: '00H', data: {} },
        ],
        timeoutMs: 100,
        timeoutMessage: 'timeout',
      },
    )
    assert.deepEqual(seen, ['01H', '00H'])
    assert.equal(response.usedSubCode, '00H')

    await assert.rejects(
      requestWithSubCodeFallback(
        { request: async () => { throw new Error('transport disconnected') } },
        {
          name: 'Example_req',
          variants: [{ subCode: '01H', data: {} }],
          timeoutMs: 100,
          timeoutMessage: 'timeout',
        },
      ),
      /transport disconnected/,
    )
  })

  it('normalizes reject details and command variants', () => {
    const error = {
      message: 'rejected',
      data: {
        RejectCode: { value: 12 },
        RejectInfoText: 'not supported',
        RejectInfo: 'details',
      },
    }
    assert.deepEqual(getProtocolRejectDetails(error), {
      rejectCode: '12',
      rejectedExtendedMsgCode: undefined,
      rejectedMsgSubc: undefined,
      rejectInfo: 'details',
      rejectInfoText: 'not supported',
      correlationId: undefined,
    })
    const vendorRejectError = {
      name: 'RejectError',
      message: 'Wrong rx_size',
      details: {
        kind: 'pss',
        raw: {
          correlationId: 'clear-1',
          data: {
            RejectedExtendedMsgCode: '0031H',
            RejectedMsgSubc: '04H',
            RejectCode: { value: '02H' },
            RejectInfo: '09H',
            RejectInfoText: 'Wrong rx_size',
          },
        },
      },
    }
    assert.deepEqual(getProtocolRejectDetails(vendorRejectError), {
      rejectCode: '02H',
      rejectedExtendedMsgCode: '0031H',
      rejectedMsgSubc: '04H',
      rejectInfo: '09H',
      rejectInfoText: 'Wrong rx_size',
      correlationId: 'clear-1',
    })
    assert.equal(
      getProtocolErrorText(error),
      'rejected | not supported | details',
    )
    assert.equal(
      isUnknownSubCodeError(
        new Error('Example_req subCode "01h" unknown'),
        'Example_req',
        '01H',
      ),
      true,
    )
    const variant = buildCommandVariant('READ_PRICE_SET_STATUS', {
      subCode: '00H',
    })
    assert.equal(variant.subCode, '00H')
  })
})
