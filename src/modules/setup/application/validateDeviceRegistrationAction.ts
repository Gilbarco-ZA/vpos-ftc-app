import { validateRegistrationCode } from '@/src/shared/setup/validate'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function validateDeviceRegistrationAction(
  _stationId: string,
  registrationCode: string,
) {
  return validateRegistrationCode(
    requireNonEmptyString(registrationCode, 'registrationCode'),
  )
}
