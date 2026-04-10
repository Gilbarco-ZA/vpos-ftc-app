import { applyPumpMessage } from '../infrastructure/pumpStore'

export function applyPumpRuntimeMessage(message: unknown) {
  if (message == null) {
    throw new Error('message is required')
  }
  applyPumpMessage(message)
  return { success: true }
}
