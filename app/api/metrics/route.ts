import {
  incCounter,
  snapshotPrometheusText,
} from '@/src/platform/observability/metrics'
import { text } from '@/src/platform/web/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  incCounter('http_requests_total', 'Total HTTP requests served', 1)
  const body = snapshotPrometheusText()

  return text(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
