import {
  deleteEnvValue as platformDeleteEnvValue,
  getEnvValue as platformGetEnvValue,
  listEnvValues as platformListEnvValues,
  setEnvValue as platformSetEnvValue,
} from '@/src/platform/config/env-db'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getEnvValue(
  stationId: string,
  name: string,
  defaultValue?: string,
): Promise<string | undefined> {
  return await platformGetEnvValue(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(name, 'name'),
    defaultValue,
  )
}

export async function setEnvValue(
  stationId: string,
  name: string,
  value: string,
): Promise<void> {
  await platformSetEnvValue(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(name, 'name'),
    String(value),
  )
}

export async function listEnvValues(stationId: string) {
  return await platformListEnvValues(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export async function deleteEnvValue(stationId: string, name: string) {
  await platformDeleteEnvValue(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(name, 'name'),
  )
}
