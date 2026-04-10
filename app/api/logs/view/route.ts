import { GET as AdminLogsViewGET } from '@/app/api/admin/logs/view/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Console compatibility alias for /api/logs/view (vpos-console)
export const GET = AdminLogsViewGET
