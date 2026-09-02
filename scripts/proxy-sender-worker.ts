import { runProxySenderWorker } from '@/workers/proxy-sender.worker'

runProxySenderWorker().catch((e) => {
  // Keep logging behavior aligned with the previous dedicated script.
  console.error(e)
  process.exit(1)
})
