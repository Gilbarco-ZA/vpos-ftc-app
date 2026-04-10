import { getRuntimeBus } from '@/src/shared/runtime/bus'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export async function publishRuntimeBusMessage(args: {
  topic: string
  message: unknown
}) {
  const topic = requireNonEmptyString(args.topic, 'topic') as any
  const message = ensurePlainObject(args.message, args.message as any)
  await getRuntimeBus().publish(topic, message)
  return { ok: true }
}
