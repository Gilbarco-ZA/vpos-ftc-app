/** Volatile scheduling only: durable jobs and attempt counters remain in PostgreSQL. */
export class PrinterBackoff {
  private readonly destinations = new Map<string, number>()
  private readonly jobs = new Map<string, number>()
  constructor(private readonly now = () => performance.now()) {}

  private prune(map: Map<string, number>) {
    const now = this.now()
    for (const [key, until] of map) if (until <= now) map.delete(key)
  }

  blockedUntil(destination: string) {
    this.prune(this.destinations)
    return this.destinations.get(destination) ?? 0
  }

  fail(destination: string, delayMs: number) {
    const until = this.now() + delayMs
    this.destinations.set(destination, until)
    return until
  }

  defer(jobId: string, until: number) {
    this.jobs.set(jobId, until)
  }

  excludedIds() {
    this.prune(this.jobs)
    return [...this.jobs.keys()]
  }
}
