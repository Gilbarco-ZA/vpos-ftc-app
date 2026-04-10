export class FiscalInboxNotFoundError extends Error {
  constructor(id: number) {
    super(`Fiscal inbox row ${id} not found`)
    this.name = 'FiscalInboxNotFoundError'
  }
}

export class FiscalInboxStatusTransitionError extends Error {
  constructor(currentStatus: unknown, nextStatus: unknown) {
    super(
      `Invalid fiscal inbox status transition: ${String(currentStatus ?? 'UNKNOWN')} -> ${String(nextStatus ?? 'UNKNOWN')}`,
    )
    this.name = 'FiscalInboxStatusTransitionError'
  }
}
