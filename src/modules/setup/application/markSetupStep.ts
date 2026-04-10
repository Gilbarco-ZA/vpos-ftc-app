import { badRequest, ok } from '@/src/platform/web/api/response'
import {
  isAllowedSetupStep,
  listAllowedSetupSteps,
  markSetupStep,
  normalizeSetupStep,
} from '@/src/shared/setup/steps'

export async function markAdminSetupStep(
  stationId: string,
  stepInput: unknown,
) {
  const step = normalizeSetupStep(stepInput)
  if (!isAllowedSetupStep(step)) {
    return badRequest(
      `Invalid step. Allowed: ${listAllowedSetupSteps().join(', ')}`,
    )
  }

  return ok(await markSetupStep(stationId, step))
}
