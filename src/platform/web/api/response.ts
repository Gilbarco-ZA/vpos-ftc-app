import { NextResponse } from "next/server";

import { logServerError } from '@/src/platform/observability/errorLogger'
import { AuthError } from '@/src/shared/auth'
import { randomBytesAsync } from '@/src/shared/crypto/randomBytes'

import { AppError } from './api-error'

export const ok = <T>(data?: T, init?: ResponseInit) => {
  return NextResponse.json({ ok: true, success: true, data }, init)
}

export const created = <T>(data?: T, init?: ResponseInit) => {
  return NextResponse.json(
    { ok: true, success: true, data },
    { status: 201, ...init },
  )
}

export const fail = (
  message: string,
  status = 400,
  init?: ResponseInit,
  extra?: any,
) => {
  return NextResponse.json(
    { ok: false, success: false, error: { message, ...extra } },
    { status, ...init },
  )
}

async function makeRequestId(req?: Request) {
  const headerValue = req?.headers?.get('x-request-id')
  if (headerValue) {
    return headerValue
  }

  const buffer = await randomBytesAsync(8)
  return buffer.toString('hex')
}

export async function serverError(
  err: unknown,
  opts?: { req?: Request; stationId?: string },
) {
  const requestId = await makeRequestId(opts?.req)
  const exposeDebugDetails =
    process.env.DEBUG_ERRORS === 'true' ||
    opts?.req?.headers?.get('x-debug-errors') === '1'

  if (err instanceof AuthError) {
    const status = err.statusCode ?? 401
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: {
          code: status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED',
          message: err.message,
          requestId,
        },
      },
      { status },
    )
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      await logServerError({
        stationId: opts?.stationId,
        requestId,
        message: err.message,
        stack: err.stack,
        meta: { code: err.code, details: err.details },
      })
    }

    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details ?? null,
          requestId,
        },
      },
      { status: err.status },
    )
  }

  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  const anyErr = err as any
  const pg = anyErr
    ? {
        pgCode: anyErr.code ?? null,
        pgDetail: anyErr.detail ?? null,
        pgConstraint: anyErr.constraint ?? null,
        pgTable: anyErr.table ?? null,
        pgColumn: anyErr.column ?? null,
      }
    : null

  await logServerError({
    stationId: opts?.stationId,
    requestId,
    message,
    stack,
    meta: {
      method: opts?.req?.method ?? null,
      url: opts?.req ? new URL(opts.req.url).pathname : null,
      ...(pg ?? {}),
    },
  })

  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: exposeDebugDetails
          ? {
              originalMessage: message,
              ...(pg ?? {}),
            }
          : null,
        requestId,
      },
    },
    { status: 500 },
  )
}

export const badRequest = (message: string, init?: ResponseInit, extra?: any) =>
  fail(message, 400, init, extra)

export const unauthorized = (
  message = 'Unauthorized',
  init?: ResponseInit,
  extra?: any,
) => fail(message, 401, init, extra)

export const forbidden = (
  message = 'Forbidden',
  init?: ResponseInit,
  extra?: any,
) => fail(message, 403, init, extra)

export const notFound = (
  message = 'Not found',
  init?: ResponseInit,
  extra?: any,
) => fail(message, 404, init, extra)

export const json = ok
export const jsonCreated = created
export const jsonError = fail
export const handleApiError = serverError

export function text(body: BodyInit | null | undefined, init?: ResponseInit) {
  return new Response(body, init)
}
