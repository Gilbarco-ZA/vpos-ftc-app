import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

import type {
  PricingCommandDeps,
  ResolvedPricingCommandDeps,
} from './contracts'
import {
  changePriceSet,
  clearPendingPriceSet,
  readCurrentPriceSet,
  readPriceSetStatus,
  readSpecificPriceSet,
} from './protocol'
import { handleGetGradePrices } from './read'
import {
  handleChangeGradePrices,
  handleClearPendingPriceSet,
} from './scheduling'

export const resolvePricingCommandDeps = (
  dependencyOverrides: PricingCommandDeps = {},
): ResolvedPricingCommandDeps => ({
  readPriceSetStatus:
    dependencyOverrides.readPriceSetStatus ?? readPriceSetStatus,
  readCurrentPriceSet:
    dependencyOverrides.readCurrentPriceSet ?? readCurrentPriceSet,
  readSpecificPriceSet:
    dependencyOverrides.readSpecificPriceSet ?? readSpecificPriceSet,
  changePriceSet: dependencyOverrides.changePriceSet ?? changePriceSet,
  clearPendingPriceSet:
    dependencyOverrides.clearPendingPriceSet ?? clearPendingPriceSet,
})

export async function handlePricingCommand(
  context: JplCommandContext,
  dependencyOverrides: PricingCommandDeps = {},
): Promise<JplCommandHandlerResult> {
  const deps = resolvePricingCommandDeps(dependencyOverrides)

  if (context.cmd.type === 'GET_GRADE_PRICES') {
    return await handleGetGradePrices(context, deps)
  }
  if (context.cmd.type === 'CLEAR_PENDING_PRICE_SET') {
    return await handleClearPendingPriceSet(context, deps)
  }
  if (context.cmd.type === 'CHANGE_GRADE_PRICES') {
    return await handleChangeGradePrices(context, deps)
  }
  return null
}
