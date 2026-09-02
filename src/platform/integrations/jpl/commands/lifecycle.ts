import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

export async function handleLifecycleCommand(
  context: JplCommandContext,
): Promise<JplCommandHandlerResult> {
  const { cmd, runtime, stationId } = context

  if (cmd.type === 'PING') {
    const gatewayState = runtime.getGatewayState()
    return {
      ok: true,
      accepted: true,
      data: {
        connected: gatewayState.apcs?.apc1?.connected ?? false,
        loggedOn: gatewayState.apcs?.apc1?.loggedOn ?? false,
      },
    }
  }

  if (cmd.type === 'POS_STATUS') {
    const gatewayState = runtime.getGatewayState()
    const replayStatus = await runtime.getReplayStatus(stationId)
    return {
      ok: true,
      accepted: true,
      data: {
        apcs: gatewayState.apcs,
        connected: gatewayState.apcs?.apc1?.connected ?? false,
        controllerStatus: gatewayState.controllerStatus ?? null,
        posConnectionStatus: gatewayState.posConnectionStatus ?? null,
        peripheralsStatus: gatewayState.peripheralsStatus ?? null,
        installStatus: gatewayState.installStatus ?? null,
        serviceMessages: gatewayState.serviceMessages ?? [],
        backOfficeRecords: gatewayState.backOfficeRecords ?? [],
        controllerFlags: gatewayState.controllerFlags ?? {},
        onlinePeerConnections: gatewayState.onlinePeerConnections ?? [],
        peripheralAlerts: gatewayState.peripheralAlerts ?? [],
        pumpErrorDiagnostics: gatewayState.pumpErrorDiagnostics ?? [],
        replayCapabilities: replayStatus.replayCapabilities,
        pendingReplayClears: replayStatus.pendingReplayClears,
        transactionCheckpoints: replayStatus.transactionCheckpoints ?? [],
        pumpStatuses: gatewayState.pumpStatuses ?? [],
        fpInfo: gatewayState.fpInfo ?? [],
        fuellingData: gatewayState.fuellingData ?? [],
        tankStatuses: gatewayState.tankStatuses ?? [],
        siteDeliveryStatus: gatewayState.siteDeliveryStatus ?? null,
        tankDeliveryData: gatewayState.tankDeliveryData ?? [],
        fpErrors: gatewayState.fpErrors ?? [],
        activePumpStatuses: gatewayState.activePumpStatuses ?? [],
        tankAlerts: gatewayState.tankAlerts ?? [],
        bufferHealth: gatewayState.bufferHealth ?? null,
        bufferAlerts: gatewayState.bufferAlerts ?? [],
      },
    }
  }

  if (cmd.type === 'GET_REPLAY_STATUS') {
    const replayStatus = await runtime.getReplayStatus(stationId)
    return { ok: true, accepted: true, data: replayStatus }
  }

  return null
}
