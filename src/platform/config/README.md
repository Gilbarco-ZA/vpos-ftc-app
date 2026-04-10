# Platform config ownership

Use `src/platform/config/*` for infrastructure and process-level configuration concerns:

- environment readers and process-level defaults
- DB-backed station config loading and effective config assembly
- plugin/device config persistence
- plugin catalog discovery and lookup
- env overrides stored in station KV

Keep `src/shared/config/*` for stable contracts and public facades:

- shared types
- shared schemas
- shared wrapper exports used by modules/routes

Keep module-level/admin workflow logic outside this surface:

- admin config editing flows
- setup UI orchestration
- feature-specific config decisions
