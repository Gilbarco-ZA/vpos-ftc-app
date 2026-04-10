# Shared utility primitives

Canonical shared utility entrypoints:

- `@/src/shared/numbers`
- `@/src/shared/utils/clipboard`
- `@/src/shared/utils/cx`
- `@/src/shared/utils/dates`
- `@/src/shared/utils/format`
- `@/src/shared/utils/getStationId`
- `@/src/shared/utils/logger`
- `@/src/shared/utils/safeAsync`
- `@/src/shared/utils/uuid`
- `@/src/shared/utils/ids`
- `@/src/shared/crypto/randomBytes`
- `@/src/shared/hooks/useApi`
- `@/src/shared/hooks/useForm`

Stability rules:

- Preserve `logger.debug|info|warn|error(tag, data?)`.
- Preserve `safeAsync(promise, context?)`.
- Preserve `uuidv4()` and `isUuid(value)`.
- Preserve `useApi(url, options?)` and `useForm(options)` call shapes.
- Preserve `formatNumber`, `formatDate`, `safeCopy`, `cx`, and `getStationId` exports.
- Use `ids.ts` when a caller needs UUID and random-byte helpers together.
- The old `lib/*` compatibility layer is gone. Use `src/shared/utils/*`, `src/shared/hooks/*`, `src/shared/numbers`, and `src/shared/crypto/*` directly.
