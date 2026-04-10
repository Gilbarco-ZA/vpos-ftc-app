# Shared error primitives

Canonical error entrypoints:

- `@/src/shared/errors/AppError`
- `@/src/shared/errors`

Stability rules:

- Preserve the `new AppError(code, message, status, details?)` constructor shape.
- Keep `ErrorCode` as the shared exported union for platform/module code.
- Use `src/shared/errors/AppError` directly; the legacy `lib/*` wrapper layer has been removed.
