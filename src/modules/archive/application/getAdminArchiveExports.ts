import {
  getArchiveExportsDeprecatedMessage,
  listArchiveExports,
} from '@/src/modules/archive/infrastructure/archiveExports'

export async function getAdminArchiveExports(stationId: string) {
  return {
    exports: await listArchiveExports(stationId, 100),
    deprecated: true,
    message: getArchiveExportsDeprecatedMessage(),
  }
}
