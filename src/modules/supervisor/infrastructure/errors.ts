export class ProcessNotFoundError extends Error {
  constructor(public readonly processName: string) {
    super(`Process not found: ${processName}`)
    this.name = 'ProcessNotFoundError'
  }
}

export class InvalidActionError extends Error {
  constructor(public readonly action: string) {
    super(`Invalid action: ${action}`)
    this.name = 'InvalidActionError'
  }
}
