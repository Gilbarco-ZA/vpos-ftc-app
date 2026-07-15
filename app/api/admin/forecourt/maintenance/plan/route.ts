import type { RecordDomsMaintenancePlanReviewInput } from '@/src/modules/forecourt/application/recordDomsMaintenancePlanReview'
import { NextResponse } from 'next/server'

import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getDomsMaintenancePlan } from '@/src/modules/forecourt/application/getDomsMaintenancePlan'
import { recordDomsMaintenancePlanReview } from '@/src/modules/forecourt/application/recordDomsMaintenancePlanReview'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return NextResponse.json(await getDomsMaintenancePlan(user.stationId))
  },
})

export const POST = defineMutationRoute<RecordDomsMaintenancePlanReviewInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await recordDomsMaintenancePlanReview(body, user)
    return NextResponse.json({ success: true, data: result })
  },
})
