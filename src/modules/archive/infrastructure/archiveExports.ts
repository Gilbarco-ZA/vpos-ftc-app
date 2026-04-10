export type ArchiveDestinationType = 's3' | 'sftp'

export type ArchiveExportStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'

export type ArchiveDestination = {
  id: number
  stationId: string
  destinationType: ArchiveDestinationType
  name: string
  configJson: any
  enabled: boolean
}

export type ArchiveExportRow = {
  id: number
  station_id: string
  destination_id: number
  from_event_id: number | null
  to_event_id: number | null
  status: ArchiveExportStatus
  attempts: number
  max_attempts: number
}

const ARCHIVE_EXPORTS_DEPRECATED_MESSAGE =
  'Archive exports are deprecated. S3 and SFTP destinations are no longer supported.'

export const getArchiveExportsDeprecatedMessage = () =>
  ARCHIVE_EXPORTS_DEPRECATED_MESSAGE

export async function listArchiveDestinations(
  _stationId: string,
): Promise<ArchiveDestination[]> {
  return []
}

export async function createArchiveDestination(_args: {
  stationId: string
  destinationType: ArchiveDestinationType
  name: string
  configJson: any
  enabled?: boolean
}) {
  throw new Error(ARCHIVE_EXPORTS_DEPRECATED_MESSAGE)
}

export async function getArchiveDestinationById(
  _stationId: string,
  _id: number,
): Promise<ArchiveDestination | null> {
  return null
}

export async function enqueueArchiveExport(_args: {
  stationId: string
  destinationId: number
  fromEventId?: number | null
  toEventId?: number | null
  scheduledAt?: Date
}) {
  throw new Error(ARCHIVE_EXPORTS_DEPRECATED_MESSAGE)
}

export async function listArchiveExports(
  _stationId: string,
  _limit = 50,
): Promise<ArchiveExportRow[]> {
  return []
}

export async function claimNextArchiveExport(
  _stationId: string,
): Promise<ArchiveExportRow | null> {
  return null
}

export async function markArchiveExportSucceeded(_exportId: number) {}

export async function markArchiveExportFailed(
  _exportId: number,
  _errorText: string,
) {}

export async function startArchiveExportAttempt(
  _exportId: number,
  _attemptNo: number,
) {}

export async function finishArchiveExportAttempt(
  _exportId: number,
  _attemptNo: number,
  _ok: boolean,
  _errorText?: string | null,
) {}

export async function writeArchiveNdjsonTempFile(_args: {
  stationId: string
  fromEventId?: number | null
  toEventId?: number | null
}) {
  throw new Error(ARCHIVE_EXPORTS_DEPRECATED_MESSAGE)
}
