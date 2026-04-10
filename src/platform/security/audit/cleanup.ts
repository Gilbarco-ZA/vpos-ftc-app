import { query } from '@/src/platform/db/postgres'

export async function cleanupAuditAndExpiredSessions() {
  const logs = await query(
    `DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '30 days'`,
  )
  const sessions = await query(`DELETE FROM sessions WHERE expires_at <= NOW()`)

  return {
    deletedAuditLogs: logs.rowCount || 0,
    deletedSessions: sessions.rowCount || 0,
  }
}
