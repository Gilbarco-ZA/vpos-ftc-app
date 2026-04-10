export type CommandContext = {
  stationId: string
  userId: string
  roles: string[]
  args?: Record<string, unknown>
}

export type CommandHandler = (ctx: CommandContext, payload: any) => Promise<any>
