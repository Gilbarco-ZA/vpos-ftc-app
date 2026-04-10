import {
  badRequest as platformBadRequest,
  created as platformCreated,
  fail as platformFail,
  forbidden as platformForbidden,
  handleApiError as platformHandleApiError,
  json as platformJson,
  jsonCreated as platformJsonCreated,
  jsonError as platformJsonError,
  notFound as platformNotFound,
  ok as platformOk,
  serverError as platformServerError,
  text as platformText,
  unauthorized as platformUnauthorized,
} from '@/src/platform/web/api/response'

/**
 * Shared API response helpers are a stable route-facing facade.
 * Serialization and error logging remain platform/web/api responsibilities.
 */
export const ok = <T>(data?: T, init?: ResponseInit) => platformOk(data, init)

export const created = <T>(data?: T, init?: ResponseInit) =>
  platformCreated(data, init)

export const fail = (
  message: string,
  status = 400,
  init?: ResponseInit,
  extra?: any,
) => platformFail(message, status, init, extra)

export async function serverError(
  err: unknown,
  opts?: { req?: Request; stationId?: string },
) {
  return await platformServerError(err, opts)
}

export const badRequest = (message: string, init?: ResponseInit, extra?: any) =>
  platformBadRequest(message, init, extra)

export const unauthorized = (
  message = 'Unauthorized',
  init?: ResponseInit,
  extra?: any,
) => platformUnauthorized(message, init, extra)

export const forbidden = (
  message = 'Forbidden',
  init?: ResponseInit,
  extra?: any,
) => platformForbidden(message, init, extra)

export const notFound = (
  message = 'Not found',
  init?: ResponseInit,
  extra?: any,
) => platformNotFound(message, init, extra)

export const json = platformJson
export const jsonCreated = platformJsonCreated
export const jsonError = platformJsonError
export const handleApiError = platformHandleApiError

export function text(body: BodyInit | null | undefined, init?: ResponseInit) {
  return platformText(body, init)
}
