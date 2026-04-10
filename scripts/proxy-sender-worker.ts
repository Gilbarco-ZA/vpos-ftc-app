import { runProxySenderWorker } from '@/workers/proxy-sender.worker'

runProxySenderWorker().catch((e) => {
  // Keep logging behavior aligned with the previous dedicated script.
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
