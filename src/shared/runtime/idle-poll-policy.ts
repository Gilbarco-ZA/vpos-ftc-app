/** Back off empty polls without changing the active processing interval. */
export class IdlePollPolicy {
  private delay: number
  private nextAt = 0
  constructor(
    private readonly baseMs: number,
    private readonly maxMs = 5000,
    private readonly now = () => performance.now(),
  ) {
    this.delay = baseMs
  }

  ready() { return this.now() >= this.nextAt }

  completed(workFound: boolean) {
    this.delay = workFound ? this.baseMs : Math.min(
      Math.max(this.baseMs, this.maxMs), this.delay * 2,
    )
    this.nextAt = this.now() + this.delay
  }

  reset() {
    this.delay = this.baseMs
    this.nextAt = 0
  }

  get delayMs() { return this.delay }
}
