import { checkDeviceCertificate as checkDeviceCertificateShared } from '@/src/shared/setup/certificates'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function checkDeviceCertificate(stationId: string) {
  return await checkDeviceCertificateShared(
    requireNonEmptyString(stationId, 'stationId'),
  )
}
