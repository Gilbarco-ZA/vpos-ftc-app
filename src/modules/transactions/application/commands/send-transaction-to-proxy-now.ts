import { sendTransactionToProxyNow } from '../../infrastructure/fiscalization/proxySenderWorker'

export async function sendTransactionToProxyNowCommand(
  input: Parameters<typeof sendTransactionToProxyNow>[0],
) {
  return sendTransactionToProxyNow(input)
}
