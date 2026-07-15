import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'
import {
  listLanguages,
  setLanguageActive,
  upsertLanguage,
} from '@/src/shared/server/i18n/languages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  action?: 'upsert' | 'set-active'
  csrf_token?: string
  csrfToken?: string
  code?: string
  name?: string
  nativeName?: string | null
  direction?: 'ltr' | 'rtl'
  isDefault?: boolean
  isActive?: boolean
  sortOrder?: number
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async () => ok({ languages: await listLanguages() }),
})

export const POST = defineMutationRoute<Body>({
  roles: ['administrator'],
  handler: async (_req, { body }) => {
    if (body.action === 'set-active') {
      return ok({
        languages: await setLanguageActive(
          String(body.code || ''),
          Boolean(body.isActive),
        ),
      })
    }

    const language = await upsertLanguage({
      code: String(body.code || ''),
      name: String(body.name || ''),
      nativeName: body.nativeName ?? null,
      direction: body.direction === 'rtl' ? 'rtl' : 'ltr',
      isDefault: Boolean(body.isDefault),
      isActive: body.isActive ?? true,
      sortOrder: Number(body.sortOrder ?? 0),
    })

    return ok({ language, languages: await listLanguages() })
  },
})
