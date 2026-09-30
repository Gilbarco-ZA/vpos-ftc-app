# Contributing

## Change scope

Keep pull requests focused on one operational concern. Separate repository hygiene, architecture migration, feature behavior, dependency upgrades, and large UI refactors unless they must ship together.

## Development process

1. Read `AGENTS.md` and the relevant domain document.
2. Install with `npm ci` after authenticating to the private Azure Artifacts feed.
3. Create or update tests with the implementation.
4. Run focused checks during development.
5. Run the full validation command before review:

```bash
npm run check
```

Formatting and linting are separate:

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
```

## Commit hygiene

Do not commit generated server bundles, build output, logs, local environment files, certificates, private keys, generated evidence, or large agent indexes. `npm run check:hygiene` enforces the main repository rules.

## Architecture

Route handlers should remain thin and delegate to module application services. Avoid new reverse dependencies from `src/shared` to feature modules. Record durable architectural decisions in `docs/adr/`.

## Documentation

Update current documents when behavior or ownership changes. Put completed pass notes and superseded procedures in `docs/archive/`; do not use historical notes as current instructions.

## Review notes

A change touching forecourt control, fiscalization, migrations, setup security, worker leases, retention, or secure artifacts must include its operational risk, rollback approach, and targeted verification evidence.
