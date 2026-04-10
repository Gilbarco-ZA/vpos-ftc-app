import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { AdminBrandingForm } from '@/components/admin/AdminBrandingForm'

export const dynamic = 'force-dynamic'

const AdminBrandingPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Branding</h1>

      <div className="space-y-4 rounded border bg-[var(--surface-card)] p-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Branding is stored locally for this station. It controls the app
          colors and logo, plus the receipt logo, header, and footer. Receipt
          printouts remain monochrome-friendly for mono laser printers.
        </p>

        <AdminBrandingForm />
      </div>
    </div>
  )
}

export default AdminBrandingPage
