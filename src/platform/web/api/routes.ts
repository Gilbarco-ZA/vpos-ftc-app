import type { SessionUser, UserRole } from '@/src/shared/types'

import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

import { readBody } from './request'
import { badRequest, serverError } from './response'
import { readFrameworkRouteParams } from './routeParams'

export const csrfFailure = () =>
  badRequest('CSRF validation failed', { status: 403 })

type BaseContext<P> = { params: P }
type AuthContext<P> = BaseContext<P> & { user: SessionUser }
type MutationContext<B, P> = AuthContext<P> & { body: B }
type PublicMutationContext<B, P> = BaseContext<P> & { body: B }

type BaseOptions<P> = {
  roles?: UserRole[]
  csrf?: boolean
  getParams?: (ctx: any) => P | Promise<P>
}

type RouteContext<P = Record<string, string>> = {
  user: SessionUser
  params: P
}

type RouteMutationContext<P = Record<string, string>> = RouteContext<P> & {
  body: Record<string, any>
}

function defaultGetParams<P>(ctx: any): Promise<P> {
  return readFrameworkRouteParams<P>(ctx)
}

async function resolveParams<P>(
  getParams: (ctx: any) => P | Promise<P>,
  frameworkCtx: any,
): Promise<P> {
  return await Promise.resolve(getParams(frameworkCtx))
}

function getCsrfHeader(request: Request) {
  return (
    request.headers.get('x-csrf-token') || request.headers.get('x-xsrf-token')
  )
}

function isFrameworkControlFlowError(err: unknown) {
  const digest = String((err as any)?.digest || '').toUpperCase()
  const message = String((err as any)?.message || '').toUpperCase()

  return (
    digest.startsWith('NEXT_REDIRECT') ||
    digest.startsWith('NEXT_NOT_FOUND') ||
    message.includes('NEXT_REDIRECT') ||
    message.includes('NEXT_NOT_FOUND')
  )
}

export function defineGetRoute<
  P extends Record<string, string> = Record<string, string>,
>(
  opts: BaseOptions<P> & {
    handler: (req: Request, ctx: AuthContext<P>) => Promise<Response>
  },
) {
  return async (req: Request, frameworkCtx?: any) => {
    try {
      const user = await requireAuth(opts.roles)
      const params = await resolveParams(
        opts.getParams || defaultGetParams<P>,
        frameworkCtx,
      )
      return await opts.handler(req, { user, params })
    } catch (err) {
      if (String((err as any)?.message || '').includes('CSRF')) {
        return csrfFailure()
      }
      if (isFrameworkControlFlowError(err)) throw err
      return await serverError(err, { req })
    }
  }
}

export function definePublicGetRoute<
  P extends Record<string, string> = Record<string, string>,
>(opts: {
  getParams?: (ctx: any) => P | Promise<P>
  handler: (req: Request, ctx: BaseContext<P>) => Promise<Response>
}) {
  return async (req: Request, frameworkCtx?: any) => {
    try {
      const params = await resolveParams(
        opts.getParams || defaultGetParams<P>,
        frameworkCtx,
      )
      return await opts.handler(req, { params })
    } catch (err) {
      if (String((err as any)?.message || '').includes('CSRF')) {
        return csrfFailure()
      }
      if (isFrameworkControlFlowError(err)) throw err
      return await serverError(err, { req })
    }
  }
}

export function defineMutationRoute<
  B = Record<string, any>,
  P extends Record<string, string> = Record<string, string>,
>(
  opts: BaseOptions<P> & {
    handler: (req: Request, ctx: MutationContext<B, P>) => Promise<Response>
  },
) {
  return async (req: Request, frameworkCtx?: any) => {
    try {
      const user = await requireAuth(opts.roles)
      const body = (await readBody(req)) as B
      const params = await resolveParams(
        opts.getParams || defaultGetParams<P>,
        frameworkCtx,
      )
      if (opts.csrf !== false) {
        requireCsrfFromParts({
          headerToken: getCsrfHeader(req),
          bodyToken:
            (body as any)?.csrfToken ||
            (body as any)?.csrf_token ||
            (body as any)?._csrf ||
            null,
        })
      }
      return await opts.handler(req, { user, body, params })
    } catch (err) {
      if (String((err as any)?.message || '').includes('CSRF')) {
        return csrfFailure()
      }
      if (isFrameworkControlFlowError(err)) throw err
      return await serverError(err, { req })
    }
  }
}

export function definePublicMutationRoute<
  B = Record<string, any>,
  P extends Record<string, string> = Record<string, string>,
>(opts: {
  csrf?: boolean
  getParams?: (ctx: any) => P | Promise<P>
  handler: (req: Request, ctx: PublicMutationContext<B, P>) => Promise<Response>
}) {
  return async (req: Request, frameworkCtx?: any) => {
    try {
      const body = (await readBody(req)) as B
      const params = await resolveParams(
        opts.getParams || defaultGetParams<P>,
        frameworkCtx,
      )
      if (opts.csrf) {
        requireCsrfFromParts({
          headerToken: getCsrfHeader(req),
          bodyToken:
            (body as any)?.csrfToken ||
            (body as any)?.csrf_token ||
            (body as any)?._csrf ||
            null,
        })
      }
      return await opts.handler(req, { body, params })
    } catch (err) {
      if (String((err as any)?.message || '').includes('CSRF')) {
        return csrfFailure()
      }
      if (isFrameworkControlFlowError(err)) throw err
      return await serverError(err, { req })
    }
  }
}

export function withAuth<
  P extends Record<string, string> = Record<string, string>,
>(
  roles: UserRole[],
  handler: (req: Request, ctx: RouteContext<P>) => Promise<Response>,
) {
  return defineGetRoute<P>({ roles, handler })
}

export function withMutation<
  P extends Record<string, string> = Record<string, string>,
>(
  roles: UserRole[],
  handler: (req: Request, ctx: RouteMutationContext<P>) => Promise<Response>,
) {
  return defineMutationRoute<Record<string, any>, P>({ roles, handler })
}
