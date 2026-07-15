import { queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  readCertSerial,
  readSigningKeyPem,
  readTanzaniaFiscalConfig,
} from './config'
import { parseXmlTag, signSha1Base64, xmlEscape } from './xml'

type FetchLike = typeof fetch

export type TraRegistrationTaxCodes = {
  codea: string | null
  codeb: string | null
  codec: string | null
  coded: string | null
  codee: string | null
}

export type TraRegistrationEfdmsResp = {
  ackcode: string | null
  ackmsg: string | null
  regid: string | null
  serial: string | null
  uin: string | null
  tin: string | null
  vrn: string | null
  mobile: string | null
  street: string | null
  city: string | null
  address: string | null
  country: string | null
  name: string | null
  receiptcode: string | null
  region: string | null
  routingkey: string | null
  gc: string | null
  taxoffice: string | null
  username: string | null
  password: string | null
  tokenpath: string | null
  taxcodes: TraRegistrationTaxCodes
}

export type TraRegistrationResponseJson = {
  efdms: {
    efdmsresp: TraRegistrationEfdmsResp
    efdmssignature: string | null
  }
}

export type TraRegistrationRequestAudit = {
  endpoint: string
  headers: Record<string, string | undefined>
  taxIdNo: string
  certKey: string
  xml: string
}

export type TraRegistrationResult = {
  ok: boolean
  endpoint: string
  httpStatus: number | null
  request: TraRegistrationRequestAudit
  response: {
    ackcode: string | null
    ackmsg: string | null
    payload: TraRegistrationResponseJson | null
    raw: string | null
    httpStatus: number | null
  }
  error: string | null
}

export type TraRegistrationRequestArgs = {
  baseUrl: string
  taxIdNo: string
  certKey: string
  certSerial?: string | null
  privateKeyPem?: string | null
  skipSigningForDebug?: boolean
  fetchImpl?: FetchLike
}

function urlJoin(base: string, path: string) {
  const cleanBase = String(base || '')
    .trim()
    .replace(/\/+$/, '')
  const cleanPath = String(path || '')
    .trim()
    .replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}

function clean(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length ? text : null
}

function endpointLooksNonProduction(baseUrl: string) {
  return /(?:test|virtual|sandbox|staging|dev)/i.test(String(baseUrl || ''))
}

export function resolveTraRegistrationEndpoint(
  baseUrl: string,
  opts: { production?: boolean } = {},
) {
  const cleanBase = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
  if (!cleanBase) return ''
  if (/\/api\/vfdregreq$/i.test(cleanBase)) return cleanBase

  const registrationPath =
    (opts.production ?? !endpointLooksNonProduction(cleanBase))
      ? 'api/vfdRegReq'
      : 'api/vfdregreq'

  if (/\/vfdtoken$/i.test(cleanBase)) {
    return cleanBase.replace(/\/vfdtoken$/i, `/${registrationPath}`)
  }
  if (/\/api\/efdmsrctinfo$/i.test(cleanBase)) {
    return cleanBase.replace(/\/api\/efdmsrctinfo$/i, `/${registrationPath}`)
  }
  if (/\/api\/efdmszreport$/i.test(cleanBase)) {
    return cleanBase.replace(/\/api\/efdmszreport$/i, `/${registrationPath}`)
  }

  return urlJoin(cleanBase, registrationPath)
}

export function buildTraRegistrationPayloadString(args: {
  taxIdNo: string
  certKey: string
}) {
  const taxIdNo = clean(args.taxIdNo)
  const certKey = clean(args.certKey)
  if (!taxIdNo) throw new Error('TRA registration taxIdNo/TIN is required')
  if (!certKey) throw new Error('TRA registration certKey is required')

  return `<REGDATA><TIN>${xmlEscape(taxIdNo)}</TIN><CERTKEY>${xmlEscape(
    certKey,
  )}</CERTKEY></REGDATA>`
}

export function redactTraRegistrationXml(xml: string) {
  return String(xml || '').replace(
    /<CERTKEY>[\s\S]*?<\/CERTKEY>/i,
    '<CERTKEY>***</CERTKEY>',
  )
}

export async function buildTraRegistrationPayloadXml(args: {
  taxIdNo: string
  certKey: string
  privateKeyPem?: string | null
  skipSigningForDebug?: boolean
}) {
  const unsignedXml = buildTraRegistrationPayloadString(args)
  let signature = ''

  if (!args.skipSigningForDebug) {
    if (!args.privateKeyPem) {
      throw new Error(
        'TRA registration signing key is not configured. Store a PEM private key as a secure artifact or enable skip signing only for developer testing.',
      )
    }
    signature = signSha1Base64(unsignedXml, args.privateKeyPem)
  }

  return {
    unsignedXml,
    signature,
    xml: `<?xml version="1.0"?><EFDMS>${unsignedXml}<EFDMSSIGNATURE>${xmlEscape(
      signature,
    )}</EFDMSSIGNATURE></EFDMS>`,
  }
}

function parseTaxCodes(rawXml: string): TraRegistrationTaxCodes {
  return {
    codea: clean(parseXmlTag(rawXml, 'CODEA')),
    codeb: clean(parseXmlTag(rawXml, 'CODEB')),
    codec: clean(parseXmlTag(rawXml, 'CODEC')),
    coded: clean(parseXmlTag(rawXml, 'CODED')),
    codee: clean(parseXmlTag(rawXml, 'CODEE')),
  }
}

export function parseTraRegistrationResponseXml(
  rawXml: string,
): TraRegistrationResponseJson {
  const raw = String(rawXml || '')
  return {
    efdms: {
      efdmsresp: {
        ackcode: clean(parseXmlTag(raw, 'ACKCODE')),
        ackmsg: clean(parseXmlTag(raw, 'ACKMSG')),
        regid: clean(parseXmlTag(raw, 'REGID')),
        serial: clean(parseXmlTag(raw, 'SERIAL')),
        uin: clean(parseXmlTag(raw, 'UIN')),
        tin: clean(parseXmlTag(raw, 'TIN')),
        vrn: clean(parseXmlTag(raw, 'VRN')),
        mobile: clean(parseXmlTag(raw, 'MOBILE')),
        street: clean(parseXmlTag(raw, 'STREET')),
        city: clean(parseXmlTag(raw, 'CITY')),
        address: clean(parseXmlTag(raw, 'ADDRESS')),
        country: clean(parseXmlTag(raw, 'COUNTRY')),
        name: clean(parseXmlTag(raw, 'NAME')),
        receiptcode: clean(parseXmlTag(raw, 'RECEIPTCODE')),
        region: clean(parseXmlTag(raw, 'REGION')),
        routingkey: clean(parseXmlTag(raw, 'ROUTINGKEY')),
        gc: clean(parseXmlTag(raw, 'GC')),
        taxoffice: clean(parseXmlTag(raw, 'TAXOFFICE')),
        username: clean(parseXmlTag(raw, 'USERNAME')),
        password: clean(parseXmlTag(raw, 'PASSWORD')),
        tokenpath: clean(parseXmlTag(raw, 'TOKENPATH')),
        taxcodes: parseTaxCodes(raw),
      },
      efdmssignature: clean(parseXmlTag(raw, 'EFDMSSIGNATURE')),
    },
  }
}

function registrationError(args: {
  httpStatus: number | null
  ackcode: string | null
  ackmsg: string | null
}) {
  if (args.httpStatus != null && args.httpStatus < 200) {
    return `TRA registration request failed (${args.httpStatus})`
  }
  if (args.httpStatus != null && args.httpStatus >= 300) {
    return `TRA registration request failed (${args.httpStatus})`
  }
  if (args.ackcode && args.ackcode !== '0') {
    return `TRA registration returned ackcode ${args.ackcode}${
      args.ackmsg ? `: ${args.ackmsg}` : ''
    }`
  }
  return null
}

export async function sendTraRegistrationRequest(
  args: TraRegistrationRequestArgs,
): Promise<TraRegistrationResult> {
  const endpoint = resolveTraRegistrationEndpoint(args.baseUrl)
  if (!endpoint) throw new Error('TRA registration base URL is required')

  const payload = await buildTraRegistrationPayloadXml({
    taxIdNo: args.taxIdNo,
    certKey: args.certKey,
    privateKeyPem: args.privateKeyPem,
    skipSigningForDebug: args.skipSigningForDebug,
  })
  const headers: Record<string, string> = {
    'content-type': 'Application/xml',
    Client: 'WEBAPI',
  }
  if (args.certSerial) headers['Cert-Serial'] = args.certSerial

  const request: TraRegistrationRequestAudit = {
    endpoint,
    headers: { ...headers },
    taxIdNo: args.taxIdNo,
    certKey: '***',
    xml: redactTraRegistrationXml(payload.xml),
  }

  try {
    const response = await (args.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers,
      body: payload.xml,
    })
    const raw = await response.text().catch(() => '')
    const parsed = raw.trim() ? parseTraRegistrationResponseXml(raw) : null
    const ackcode = parsed?.efdms.efdmsresp.ackcode ?? null
    const ackmsg = parsed?.efdms.efdmsresp.ackmsg ?? null
    const error = registrationError({
      httpStatus: response.status,
      ackcode,
      ackmsg,
    })

    return {
      ok: response.ok && !error,
      endpoint,
      httpStatus: response.status,
      request,
      response: {
        ackcode,
        ackmsg,
        payload: parsed,
        raw,
        httpStatus: response.status,
      },
      error,
    }
  } catch (e: any) {
    return {
      ok: false,
      endpoint,
      httpStatus: null,
      request,
      response: {
        ackcode: null,
        ackmsg: null,
        payload: null,
        raw: null,
        httpStatus: null,
      },
      error: `TRA registration request failed: ${String(e?.message || e)}`,
    }
  }
}

export async function sendTraRegistrationFromConfig(args: {
  stationId: string
  fetchImpl?: FetchLike
}) {
  const cfg = await readTanzaniaFiscalConfig(args.stationId)
  if (!cfg.tra.baseUrl) {
    throw new Error('Tanzania TRA base URL is not configured')
  }
  if (!cfg.tra.taxIdNo) {
    throw new Error('Tanzania TRA taxIdNo/TIN is not configured')
  }
  const certKey = cfg.tra.certKey ?? cfg.tra.vfdSerialNo
  if (!certKey) {
    throw new Error('Tanzania TRA certKey is not configured')
  }

  return await sendTraRegistrationRequest({
    baseUrl: cfg.tra.baseUrl,
    taxIdNo: cfg.tra.taxIdNo,
    certKey,
    certSerial: cfg.tra.certSerial ?? (await readCertSerial(args.stationId)),
    privateKeyPem: await readSigningKeyPem(args.stationId),
    skipSigningForDebug: cfg.tra.skipSigningForDebug,
    fetchImpl: args.fetchImpl,
  })
}

function payloadStatus(result: TraRegistrationResult) {
  if (result.ok) return 'REGISTERED'
  if (result.response.ackcode) return 'REJECTED'
  return 'FAILED'
}

export async function persistTraRegistrationResult(args: {
  stationId: string
  result: TraRegistrationResult
}) {
  const responsePayload = args.result.response.payload ?? {
    efdms: {
      efdmsresp: {
        ackcode: args.result.response.ackcode,
        ackmsg: args.result.response.ackmsg,
        taxcodes: {},
      },
      efdmssignature: null,
    },
  }

  const registrationJson = {
    data: {
      regData: responsePayload,
      request: args.result.request,
      response: {
        ackcode: args.result.response.ackcode,
        ackmsg: args.result.response.ackmsg,
        httpStatus: args.result.response.httpStatus,
        raw: args.result.response.raw,
      },
      error: args.result.error,
      timestamp: new Date().toISOString(),
    },
  }

  await queryOne(
    `INSERT INTO fiscal_registration (id, station_id, status, registration_json, registered_at)
          VALUES ($1, $2, $3, $4::jsonb, CASE WHEN $5 THEN NOW() ELSE NULL END)
     ON CONFLICT (station_id)
     DO UPDATE SET status = EXCLUDED.status,
                   registration_json = EXCLUDED.registration_json,
                   registered_at = CASE WHEN $5 THEN COALESCE(fiscal_registration.registered_at, NOW()) ELSE fiscal_registration.registered_at END,
                   updated_at = NOW()`,
    [
      uuidv4(),
      args.stationId,
      payloadStatus(args.result),
      JSON.stringify(registrationJson),
      args.result.ok,
    ],
  )

  return registrationJson
}

export async function sendAndPersistTraRegistrationFromConfig(args: {
  stationId: string
  fetchImpl?: FetchLike
}) {
  const result = await sendTraRegistrationFromConfig(args)
  await persistTraRegistrationResult({ stationId: args.stationId, result })
  return result
}
