import {
  getArchiveExportsDeprecatedMessage,
  listArchiveDestinations as listArchiveDestinationsFromModule,
  listArchiveExports as listArchiveExportsFromModule,
} from '@/src/modules/archive/infrastructure/archiveExports'

export { getArchiveExportsDeprecatedMessage }

export async function listArchiveDestinations(stationId: string) {
  return await listArchiveDestinationsFromModule(stationId)
}

export async function listArchiveExports(stationId: string, limit = 100) {
  return await listArchiveExportsFromModule(stationId, limit)
}
