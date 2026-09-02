// Compatibility alias. Prefer imports from ./atgPollingWorker.
export {
  runAtgPollingWorkerLoop as runAtgHistoryWorkerLoop,
  startAtgPollingWorker as startAtgHistoryWorker,
} from './atgPollingWorker'
export type { AtgPollingWorkerDeps as AtgHistoryWorkerDeps } from './atgPollingWorker'
