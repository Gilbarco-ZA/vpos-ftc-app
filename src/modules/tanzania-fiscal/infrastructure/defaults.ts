export const TRA_PRODUCTION_BASE_URL = 'https://vfd.tra.go.tz/'
export const TRA_TEST_BASE_URL = 'https://vfdtest.tra.go.tz/'
export const TRA_VERIFICATION_BASE_URL = 'https://verify.tra.go.tz'

export const EWURA_PRODUCTION_BASE_URL =
  'https://npgisretailer.ewura.go.tz/api/v1'
export const EWURA_DEVELOPMENT_BASE_URL = 'http://41.59.251.174:8082/api/v1'
export const EWURA_DEFAULT_API_SOURCE_ID = '176229195_SPNEXT'

const joinUrl = (baseUrl: string, path: string) =>
  `${String(baseUrl || '').replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`

export const buildTraEndpointDetails = (baseUrl = TRA_PRODUCTION_BASE_URL) => {
  const normalizedBase = String(baseUrl || TRA_PRODUCTION_BASE_URL).trim()
  const isTest = /(?:vfdtest|test|sandbox|staging|dev)/i.test(normalizedBase)

  return {
    baseUrl: normalizedBase,
    registrationUrl: joinUrl(
      normalizedBase,
      isTest ? 'api/vfdregreq' : 'api/vfdRegReq',
    ),
    tokenUrl: joinUrl(normalizedBase, 'vfdtoken'),
    receiptUrl: joinUrl(normalizedBase, 'api/efdmsRctInfo'),
    zReportUrl: joinUrl(normalizedBase, 'api/efdmszreport'),
    verificationUrl: TRA_VERIFICATION_BASE_URL,
  }
}
