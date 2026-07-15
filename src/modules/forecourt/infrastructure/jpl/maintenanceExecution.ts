import { startJplTcpAdapter } from './lifecycle'
import { normalizeJplInboundEnvelope } from './protocol/schema'

const ALLOWED_MAINTENANCE_MESSAGES = new Set([
  'install_Fp_req',
  'install_Tg_req',
  'install_Dispenser_req',
  'install_Pp_req',
  'clear_InstallData_req',
])

export type DomsMaintenanceJplEnvelope = {
  name: string
  subCode: string
  data: Record<string, unknown>
  correlationId?: unknown
}

export async function sendDomsMaintenanceJplEnvelope(
  envelope: DomsMaintenanceJplEnvelope,
) {
  if (!ALLOWED_MAINTENANCE_MESSAGES.has(envelope.name)) {
    throw new Error(
      `Maintenance JPL message is not allowlisted: ${envelope.name}`,
    )
  }

  if (!globalThis.__jplTcpClient) await startJplTcpAdapter()
  const client = globalThis.__jplTcpClient
  if (!client) throw new Error('JPL TCP adapter is not connected')

  const response = await client.request(envelope as any)
  const inbound = normalizeJplInboundEnvelope(response)
  if (String(inbound?.name ?? '') === 'RejectMessage_resp') {
    const rejectCode = (inbound?.data as any)?.RejectCode?.value ?? 'unknown'
    const rejectInfo =
      (inbound?.data as any)?.RejectInfoText ??
      (inbound?.data as any)?.RejectInfo ??
      'No reject detail returned'
    throw new Error(
      `PSS rejected ${envelope.name}: ${rejectCode} - ${rejectInfo}`,
    )
  }

  return inbound
}
