import {
  getArchiveExportsDeprecatedMessage,
  listArchiveDestinations,
} from '@/src/modules/archive/infrastructure/archiveExports'

export async function getAdminArchiveDestinations(stationId: string) {
  return {
    destinations: await listArchiveDestinations(stationId),
    deprecated: true,
    message: getArchiveExportsDeprecatedMessage(),
  }
}
