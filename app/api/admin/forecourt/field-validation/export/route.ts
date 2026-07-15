import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getDomsFieldValidationReadiness } from '@/src/modules/forecourt/application/getDomsFieldValidationReadiness'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const safeFilePart = (value: string) => {
  const cleaned = value
    .trim()
    .replaceAll(' ', '-')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0)
      const isNumber = code >= 48 && code <= 57
      const isUpperAlpha = code >= 65 && code <= 90
      const isLowerAlpha = code >= 97 && code <= 122
      return (
        isNumber ||
        isUpperAlpha ||
        isLowerAlpha ||
        char === '_' ||
        char === '.' ||
        char === '-'
      )
    })
    .join('')
    .slice(0, 80)

  return cleaned || 'station'
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const generatedAt = new Date().toISOString()
    const readiness = await getDomsFieldValidationReadiness(user.stationId)
    const payload = {
      exportType: 'doms-field-validation-readiness',
      generatedAt,
      stationId: user.stationId,
      safetyNotice:
        'This export is diagnostic only. It records field-validation readiness and does not authorize DOMS/PSS write execution or Tanzania fiscalization cutover.',
      readiness,
    }
    const filename = `doms-field-validation-${safeFilePart(user.stationId)}-${generatedAt
      .replaceAll('-', '')
      .replaceAll(':', '')
      .replaceAll('.', '')}.json`

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'content-disposition': `attachment; filename="${filename}"`,
        'content-type': 'application/json; charset=utf-8',
      },
    })
  },
})
