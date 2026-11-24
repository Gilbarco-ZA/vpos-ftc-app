type State = { signature: string; writtenAt: number }
type Entry = { state?: State; pending?: Promise<void> }

/** Process-local write coalescing. Never refresh persisted liveness on a failed write. */
export class HeartbeatWritePolicy {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly intervalMs = 5000,
    private readonly now = () => performance.now(),
  ) {}

  async write(key: string, signature: string, persist: () => Promise<void>) {
    let entry = this.entries.get(key)
    if (!entry) {
      entry = {}
      this.entries.set(key, entry)
    }
    while (entry.pending) await entry.pending.catch(() => {})
    const last = entry.state
    if (last && last.signature === signature &&
        this.now() - last.writtenAt < this.intervalMs) return

    const pending = Promise.resolve().then(async () => {
      await persist()
      entry.state = { signature, writtenAt: this.now() }
    })
    entry.pending = pending
    try {
      await pending
    } finally {
      if (entry.pending === pending) entry.pending = undefined
      // Keep this process-local cache bounded; never evict an in-flight write.
      if (this.entries.size > 2048) {
        for (const [id, value] of this.entries) {
          if (id !== key && !value.pending) {
            this.entries.delete(id)
            if (this.entries.size <= 2048) break
          }
        }
      }
    }
  }

  invalidateStation(stationId: string) {
    for (const [key, entry] of this.entries) {
      if (key.startsWith(JSON.stringify([stationId]).slice(0, -1) + ',')) {
        entry.state = undefined
      }
    }
  }
}
