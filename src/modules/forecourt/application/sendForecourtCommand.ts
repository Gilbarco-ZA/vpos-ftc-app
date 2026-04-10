import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { sendForecourtCommandRepo } from '../infrastructure/forecourtRepo'

export async function sendForecourtCommand(input: any) {
  const stationId = requireNonEmptyString(input?.stationId, 'stationId')
  const command = requireNonEmptyString(input?.command, 'command')
  return await sendForecourtCommandRepo({ ...input, stationId, command })
}
