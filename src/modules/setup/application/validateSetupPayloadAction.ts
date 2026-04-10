import { validateSetupPayload as validateSetupPayloadShared } from '@/src/shared/setup/validate'

export async function validateSetupPayloadAction(
  payload: Record<string, unknown>,
) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be an object')
  }
  return await validateSetupPayloadShared(payload)
}
