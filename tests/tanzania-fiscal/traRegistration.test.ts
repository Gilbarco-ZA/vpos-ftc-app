import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import {
  buildTraRegistrationPayloadString,
  buildTraRegistrationPayloadXml,
  parseTraRegistrationResponseXml,
  redactTraRegistrationXml,
  resolveTraRegistrationEndpoint,
  sendTraRegistrationRequest,
} from '../../src/modules/tanzania-fiscal/infrastructure/traRegistration'

test('resolves TRA registration endpoints with package-compatible casing', () => {
  assert.equal(
    resolveTraRegistrationEndpoint('https://vfd.tra.go.tz'),
    'https://vfd.tra.go.tz/api/vfdRegReq',
  )
  assert.equal(
    resolveTraRegistrationEndpoint('https://virtual.tra.go.tz'),
    'https://virtual.tra.go.tz/api/vfdregreq',
  )
  assert.equal(
    resolveTraRegistrationEndpoint('https://vfd.tra.go.tz/vfdtoken'),
    'https://vfd.tra.go.tz/api/vfdRegReq',
  )
  assert.equal(
    resolveTraRegistrationEndpoint(
      'https://vfd.tra.go.tz/api/efdmsRctInfo',
    ),
    'https://vfd.tra.go.tz/api/vfdRegReq',
  )
})

test('builds the package-compatible TRA registration REGDATA payload', () => {
  assert.equal(
    buildTraRegistrationPayloadString({
      taxIdNo: '109029092',
      certKey: 'CERT1',
    }),
    '<REGDATA><TIN>109029092</TIN><CERTKEY>CERT1</CERTKEY></REGDATA>',
  )
})

test('wraps TRA registration XML and signs the REGDATA payload', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })

  const payload = await buildTraRegistrationPayloadXml({
    taxIdNo: '109029092',
    certKey: 'CERT1',
    privateKeyPem: privateKey,
  })

  assert.match(payload.xml, /^<\?xml version="1\.0"\?><EFDMS>/)
  assert.match(payload.xml, /<REGDATA><TIN>109029092<\/TIN>/)
  assert.match(payload.xml, /<EFDMSSIGNATURE>[^<]+<\/EFDMSSIGNATURE>/)
})

test('parses TRA registration response XML into the reference JSON shape', () => {
  const parsed = parseTraRegistrationResponseXml(`
    <EFDMS>
      <EFDMSRESP>
        <ACKCODE>0</ACKCODE>
        <ACKMSG>Registration Successful</ACKMSG>
        <REGID>TZ01005517</REGID>
        <SERIAL>10TZ100101</SERIAL>
        <UIN>09VFDWEBAPI-101</UIN>
        <TIN>109029092</TIN>
        <VRN>40902909R</VRN>
        <RECEIPTCODE>T61C7J</RECEIPTCODE>
        <ROUTINGKEY>vfdrct</ROUTINGKEY>
        <USERNAME>user-one</USERNAME>
        <PASSWORD>pass-one</PASSWORD>
        <TOKENPATH>vfdtoken</TOKENPATH>
        <TAXCODES>
          <CODEA>18</CODEA>
          <CODEB>10</CODEB>
          <CODEC>0</CODEC>
          <CODED>0</CODED>
          <CODEE>0</CODEE>
        </TAXCODES>
      </EFDMSRESP>
      <EFDMSSIGNATURE>abc</EFDMSSIGNATURE>
    </EFDMS>
  `)

  assert.equal(parsed.efdms.efdmsresp.ackcode, '0')
  assert.equal(parsed.efdms.efdmsresp.regid, 'TZ01005517')
  assert.equal(parsed.efdms.efdmsresp.username, 'user-one')
  assert.equal(parsed.efdms.efdmsresp.taxcodes.codea, '18')
  assert.equal(parsed.efdms.efdmssignature, 'abc')
})

test('sends registration request with TRA XML headers and redacted audit payload', async () => {
  const calls: Array<{
    input: string
    headers: Record<string, string>
    body: string
  }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      input: String(input),
      headers: init?.headers as Record<string, string>,
      body: String(init?.body),
    })
    return new Response(
      '<EFDMS><EFDMSRESP><ACKCODE>0</ACKCODE><ACKMSG>Registration Successful</ACKMSG><REGID>TZ01</REGID></EFDMSRESP></EFDMS>',
      { status: 200, headers: { 'content-type': 'Application/xml' } },
    )
  }

  const result = await sendTraRegistrationRequest({
    baseUrl: 'https://vfd.tra.go.tz',
    taxIdNo: '109029092',
    certKey: 'CERT1',
    certSerial: 'SERIAL64',
    skipSigningForDebug: true,
    fetchImpl,
  })

  assert.equal(result.ok, true)
  assert.equal(result.response.ackcode, '0')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.input, 'https://vfd.tra.go.tz/api/vfdRegReq')
  assert.equal(calls[0]!.headers.Client, 'WEBAPI')
  assert.equal(calls[0]!.headers['Cert-Serial'], 'SERIAL64')
  assert.match(calls[0]!.body, /<CERTKEY>CERT1<\/CERTKEY>/)
  assert.equal(result.request.certKey, '***')
  assert.doesNotMatch(result.request.xml, /CERT1/)
  assert.equal(
    redactTraRegistrationXml('<CERTKEY>CERT1</CERTKEY>'),
    '<CERTKEY>***</CERTKEY>',
  )
})
