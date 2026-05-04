import { NextResponse } from "next/server";

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listAdminConfigDefaults } from '@/src/modules/admin-config/application/listAdminConfigDefaults'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async () => {
    const rows = await listAdminConfigDefaults()
    return NextResponse.json({ data: rows })
  },
})
