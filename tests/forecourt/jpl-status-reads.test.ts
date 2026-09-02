import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  clearBackOfficeRecord,
  clearFcServiceMessage,
  clearTankDeliveryData,
  normalizeBackOfficeRecordResponse,
  readBackOfficeRecord,
  readFcServiceMessage,
  readFcStatus,
  readFpError,
  readFpFuellingData,
  readFpInfo,
  readFpStatus,
  readPosConnectionStatus,
  readPssPeripheralsStatus,
  readSiteDeliveryStatus,
  readTankDeliveryData,
  readTgStatus,
  sendSimpleWetstockCommand,
} from '@/src/platform/integrations/jpl/protocol/statusReads'

const originalBackOfficeSubCode = process.env.JPL_BACK_OFFICE_RECORD_SUBCODE

afterEach(() => {
  if (originalBackOfficeSubCode == null) {
    delete process.env.JPL_BACK_OFFICE_RECORD_SUBCODE
  } else {
    process.env.JPL_BACK_OFFICE_RECORD_SUBCODE = originalBackOfficeSubCode
  }
})

const unknownSubCodeError = (name: string, subCode: string) =>
  new Error(`${name} subCode "${subCode.toLowerCase()}" unknown message`)

const createClient = (
  responder: (message: any) => Promise<any> | any,
) => {
  const requests: any[] = []
  return {
    requests,
    client: {
      request: async (message: any) => {
        requests.push(message)
        return await responder(message)
      },
    },
  }
}

describe('JPL status and read helpers', () => {
  it('degrades fuelling-point status through controller subcode variants', async () => {
    const { client, requests } = createClient((message) => {
      if (message.subCode !== '01H') {
        throw unknownSubCodeError(message.name, message.subCode)
      }
      return { data: { FpId: '04', FpState: '01' } }
    })

    const result = await readFpStatus(client, 100, '04', '02h')

    assert.deepEqual(
      requests.map((request) => request.subCode),
      ['02H', '03H', '01H'],
    )
    assert.equal(result.usedSubCode, '01H')
    assert.equal(result.normalized.fpId, '04')
  })

  it('degrades fuelling data, tank status, and site delivery reads', async () => {
    const successSubCodes: Record<string, string> = {
      FpFuellingData_req: '01H',
      TgStatus_req: '00H',
      SiteDeliveryStatus_req: '01H',
    }
    const { client, requests } = createClient((message) => {
      if (message.subCode !== successSubCodes[message.name]) {
        throw unknownSubCodeError(message.name, message.subCode)
      }
      if (message.name === 'FpFuellingData_req') {
        return { data: { FpId: '03' } }
      }
      if (message.name === 'TgStatus_req') {
        return { data: { TgId: '07' } }
      }
      return { data: { DeliveryReportSeqNo: '9' } }
    })

    const fuelling = await readFpFuellingData(client, 100, '03', '02H')
    const tank = await readTgStatus(client, 100, '07', '02H')
    const delivery = await readSiteDeliveryStatus(client, 100, '02H')

    assert.equal(fuelling.usedSubCode, '01H')
    assert.equal(tank.usedSubCode, '00H')
    assert.equal(delivery.usedSubCode, '01H')
    assert.deepEqual(
      requests
        .filter((request) => request.name === 'FpFuellingData_req')
        .map((request) => request.subCode),
      ['01H'],
    )
    assert.deepEqual(
      requests
        .filter((request) => request.name === 'TgStatus_req')
        .map((request) => request.subCode),
      ['02H', '01H', '00H'],
    )
    assert.deepEqual(
      requests
        .filter((request) => request.name === 'SiteDeliveryStatus_req')
        .map((request) => request.subCode),
      ['01H'],
    )
  })

  it('does not hide transport failures behind a subcode fallback', async () => {
    const { client, requests } = createClient(() => {
      throw new Error('controller disconnected')
    })

    await assert.rejects(
      readFpStatus(client, 100, '01', '03H'),
      /controller disconnected/,
    )
    assert.equal(requests.length, 1)
    assert.equal(requests[0].subCode, '03H')
  })

  it('builds exact info and error requests and snapshots their responses', async () => {
    const { client, requests } = createClient((message) => {
      if (message.name === 'FpInfo_req') {
        return { data: { FpId: '05', FpInfoParId: ['01', '02'] } }
      }
      return { data: { FpId: '05', FpErrorCode: '12' } }
    })

    const info = await readFpInfo(client, 100, '05', ['01', '02'])
    const error = await readFpError(client, 100, '05')

    assert.deepEqual(
      {
        name: requests[0].name,
        subCode: requests[0].subCode,
        data: requests[0].data,
      },
      {
        name: 'FpInfo_req',
        subCode: '01H',
        data: { FpId: '05', FpInfoParId: ['01', '02'] },
      },
    )
    assert.deepEqual(
      {
        name: requests[1].name,
        subCode: requests[1].subCode,
        data: requests[1].data,
      },
      {
        name: 'FpErrorMsg_req',
        subCode: '00H',
        data: { FpId: '05' },
      },
    )
    assert.equal(info.normalized.fpId, '05')
    assert.equal(error.normalized.fpId, '05')
  })

  it('uses the full delivery item set by default and preserves explicit items', async () => {
    const { client, requests } = createClient((message) => ({
      data: {
        TgId: message.data.TgId,
        DeliveryReportSeqNo: '1',
        TankDeliveryData: [],
      },
    }))

    await readTankDeliveryData(client, 100, '02', '07')
    await readTankDeliveryData(client, 100, '03', '07', ['02', '05'])
    await clearTankDeliveryData(client, 100, {
      PosId: '07',
      DeliveryReportSeqNo: '4',
    })

    assert.equal(requests[0].data.TankDeliveryDataItemId.length, 29)
    assert.deepEqual(requests[0].data.TankDeliveryDataItemId.slice(0, 3), [
      '01',
      '02',
      '03',
    ])
    assert.deepEqual(requests[1].data.TankDeliveryDataItemId, ['02', '05'])
    assert.deepEqual(
      {
        name: requests[2].name,
        subCode: requests[2].subCode,
        data: requests[2].data,
      },
      {
        name: 'clear_TankDeliveryData_req',
        subCode: '00H',
        data: { PosId: '07', DeliveryReportSeqNo: '4' },
      },
    )
  })

  it('builds controller status, peripherals, and service-log requests', async () => {
    const { client, requests } = createClient((message) => ({
      data: { requestName: message.name },
    }))

    await readFcStatus(client, 100)
    await readPosConnectionStatus(client, 100)
    await readPssPeripheralsStatus(client, 100)
    await readFcServiceMessage(client, 100)
    await clearFcServiceMessage(client, 100, '17')

    assert.deepEqual(
      requests.map((request) => [request.name, request.subCode]),
      [
        ['FcStatus_req', '00H'],
        ['PosConnectionStatus_req', '00H'],
        ['PssPeripheralsStatus_req', '00H'],
        ['FcServiceMsg_req', '00H'],
        ['clear_FcServiceMsg_req', '00H'],
      ],
    )
    assert.deepEqual(requests[4].data, { FcServiceMsgSeqNo: '17' })
  })

  it('ignores unsupported back-office subcodes and normalizes envelope variants', async () => {
    process.env.JPL_BACK_OFFICE_RECORD_SUBCODE = '03h'
    const { client, requests } = createClient((message) => {
      if (message.subCode === '03H') {
        throw unknownSubCodeError(message.name, message.subCode)
      }
      return {
        payload: {
          data: {
            BorSeqNo: 18,
            BorFormatId: { value: ' XML ' },
            BorData: '<record />',
          },
        },
      }
    })

    const result = await readBackOfficeRecord(client, 100)
    await clearBackOfficeRecord(client, 100, '18')

    assert.deepEqual(requests.map((request) => request.subCode), ['02H', '00H'])
    assert.deepEqual(result.normalized, {
      usedSubCode: '02H',
      seqNo: '18',
      formatId: 'XML',
      payload: {
        BorSeqNo: 18,
        BorFormatId: { value: ' XML ' },
        BorData: '<record />',
      },
    })
    assert.deepEqual(
      {
        name: requests[1].name,
        subCode: requests[1].subCode,
        data: requests[1].data,
      },
      {
        name: 'clear_BackOfficeRecord_req',
        subCode: '00H',
        data: { BorSeqNo: '18' },
      },
    )
  })

  it('normalizes empty back-office metadata without inventing identifiers', () => {
    assert.deepEqual(normalizeBackOfficeRecordResponse({ data: {} }, '00H'), {
      usedSubCode: '00H',
      seqNo: undefined,
      formatId: undefined,
      payload: {},
    })
  })

  it('builds simple wetstock commands and rejects unsupported actions', async () => {
    const { client, requests } = createClient(() => ({ accepted: true }))

    const result = await sendSimpleWetstockCommand(
      client,
      100,
      'OPEN_TANK_CONTROLLER',
      { tankId: '02', posId: '07' },
      'timeout',
    )

    assert.equal(result.request.name, 'open_TankController_req')
    assert.equal(result.response.accepted, true)
    assert.equal(requests[0].data.TankId, '02')

    await assert.rejects(
      sendSimpleWetstockCommand(
        client,
        100,
        'NOT_A_REAL_ACTION',
        {},
        'timeout',
      ),
      /Unable to build NOT_A_REAL_ACTION request/,
    )
  })
})
