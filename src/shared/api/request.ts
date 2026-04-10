import type {
  QueryValue as PlatformQueryValue,
  RequestBody as PlatformRequestBody,
} from '@/src/platform/web/api/request'

import {
  getQueryBool as platformGetQueryBool,
  getQueryFloat as platformGetQueryFloat,
  getQueryInt as platformGetQueryInt,
  getQueryParam as platformGetQueryParam,
  getReturnUrl as platformGetReturnUrl,
  getSearchParams as platformGetSearchParams,
  readBody as platformReadBody,
  toBool as platformToBool,
  toFloat as platformToFloat,
  toInt as platformToInt,
  wantsHtmlRedirect as platformWantsHtmlRedirect,
} from '@/src/platform/web/api/request'

/**
 * Shared API request helpers are a stable caller-facing contract.
 * The parsing implementation lives in platform/web/api.
 */
export type RequestBody = PlatformRequestBody
export type QueryValue = PlatformQueryValue

export async function readBody(request: Request): Promise<RequestBody> {
  return await platformReadBody(request)
}

export function toInt(value: any, fallback?: number): number | undefined {
  return platformToInt(value, fallback)
}

export function toFloat(value: any, fallback?: number): number | undefined {
  return platformToFloat(value, fallback)
}

export function toBool(value: any, fallback?: boolean): boolean | undefined {
  return platformToBool(value, fallback)
}

export function getSearchParams(request: Request): URLSearchParams {
  return platformGetSearchParams(request)
}

export function getQueryParam(
  request: Request,
  key: string,
  fallback: QueryValue = null,
): QueryValue {
  return platformGetQueryParam(request, key, fallback)
}

export function getQueryInt(
  request: Request,
  key: string,
  fallback?: number,
): number | undefined {
  return platformGetQueryInt(request, key, fallback)
}

export function getQueryFloat(
  request: Request,
  key: string,
  fallback?: number,
): number | undefined {
  return platformGetQueryFloat(request, key, fallback)
}

export function getQueryBool(
  request: Request,
  key: string,
  fallback?: boolean,
): boolean | undefined {
  return platformGetQueryBool(request, key, fallback)
}

export function wantsHtmlRedirect(req: Request): boolean {
  return platformWantsHtmlRedirect(req)
}

export function getReturnUrl(req: Request, fallback = '/dashboard'): URL {
  return platformGetReturnUrl(req, fallback)
}
