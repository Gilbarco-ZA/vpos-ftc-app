import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { ControlPanelClient } from '@/components/admin/ControlPanelClient'
import { SystemDataManagementPanel } from '@/components/admin/SystemDataManagementPanel'

export const dynamic = 'force-dynamic'

const AdminControlPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Control</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Runtime control surface for this station. Commands are executed via{' '}
        <code>/api/control</code> and logged to{' '}
        <code>process_control_events</code>.
      </p>

      <ControlPanelClient />

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Data maintenance</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Create portable backups or reset this installation before assigning
            the machine to a new client.
          </p>
        </div>
        <SystemDataManagementPanel />
      </section>
    </div>
  )
}

export default AdminControlPage
