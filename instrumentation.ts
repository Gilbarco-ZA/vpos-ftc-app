export async function register() {
  // Keep instrumentation runtime-neutral for Next.js 16.2/Turbopack.
  // Legacy import bootstrapping is handled by ensureFirstBoot(), which runs
  // in the Node.js application path instead of Edge instrumentation.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
}
