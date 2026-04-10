import { getStationKv } from '@/src/shared/setup/storage'
import { validateCertData } from '@/src/shared/setup/validate'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function checkDeviceCertificate(
  stationId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const certData = await getStationKv<string>(
    normalizedStationId,
    'vpos.cert.data',
  )
  if (!certData) return { success: false, error: 'Certificate data not stored' }

  const v = validateCertData(certData)
  if (!v.ok) return { success: false, error: v.error }

  const certPass = await getStationKv<string>(
    normalizedStationId,
    'vpos.cert.passphrase',
  )
  if (!certPass) return { success: false, error: 'Certificate pass not stored' }

  return { success: true }
}
