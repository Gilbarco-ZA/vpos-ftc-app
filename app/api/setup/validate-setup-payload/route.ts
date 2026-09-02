import { POST as validateSetupPost } from '../validate-setup/route'

// Compatibility alias. Prefer /api/setup/validate-setup.
// Route segment configuration must be declared locally so Next.js can
// statically evaluate it during the production build.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = validateSetupPost
