# Agent Instructions

This file is the primary instruction source for AI-assisted work in this repository. Load it before making changes. Load only the domain document and runbook relevant to the task; documents under `docs/archive/` are historical evidence and are not current guidance.

## Repository objective

VPOS FTC operates fuel-station transaction, fiscalization, receipt, forecourt, configuration, reporting, and supervision workflows. Changes can affect physical equipment, fiscal records, payment-adjacent data, and station availability. Prefer small, traceable changes over broad rewrites.

## Authoritative documentation

- `README.md`: setup, commands, and repository overview
- `docs/architecture.md`: dependency direction and runtime topology
- `docs/configuration.md`: configuration ownership and precedence
- `docs/startup-flow.md`: server startup sequence
- `docs/testing.md`: test policy and commands
- `docs/domains/*.md`: current domain behavior
- `docs/runbooks/*.md`: operator procedures
- `docs/adr/*.md`: accepted architectural decisions

Do not use `docs/archive/**` as implementation authority unless the task is explicitly historical.

## Standard workflow

1. Identify the owning module and relevant entrypoint.
2. Inspect direct dependencies and related tests using the scoped agent commands.
3. Make the smallest change that preserves existing operational behavior.
4. Add or update tests at the closest stable boundary.
5. Run focused validation, then `npm run check` when dependencies are available.
6. Update authoritative documentation only when current behavior, commands, or ownership changed.

## Scoped navigation commands

```bash
npm run agent:find -- route <query>
npm run agent:find -- page <query>
npm run agent:find -- test <query>
npm run agent:deps -- <file-or-directory>
npm run agent:impact -- <file-or-directory>
npm run agent:tests -- <file-or-directory>
npm run agent:manifest
```

Do not regenerate or commit large all-repository symbol/import indexes.

## Dependency rules

The intended direction is:

```text
app and components
  -> module application or presentation
  -> module domain
  -> module infrastructure and platform
```

Rules for new or modified code:

- API route files handle authentication, authorization, CSRF, input validation, and response mapping.
- API routes should call module application services rather than importing repositories or database clients directly.
- Domain code must not import infrastructure, Next.js, React, database, filesystem, network, or process-environment modules.
- `src/platform/` must remain feature-agnostic where practical.
- `src/shared/` is for dependency-light utilities and temporary compatibility exports. Do not add new `src/shared -> src/modules` dependencies.
- `npm run check:module-boundaries` uses a reviewed baseline: reductions are welcome; additions fail.
- Client components must not import server-only modules.
- Event contracts should be declared separately from event listeners to avoid cycles.
- Compatibility aliases require a comment naming the preferred path.

## Module ownership

- `src/modules/transactions`: transaction lifecycle and fiscalization orchestration
- `src/modules/fiscal-inbox`: fiscal inbox processing and recovery
- `src/modules/forecourt`: DOMS/JPL integration, pump/tank state, commands, and reconciliation
- `src/modules/printing`: print jobs and receipt workflows
- `src/modules/reports`: report generation and queues
- `src/modules/products`: product catalog and synchronization
- `src/modules/customers`: customer records and transaction association
- `src/modules/setup`: first-run setup and validation
- `src/modules/runtime`, `supervisor`, `status`: process/runtime state and supervision
- `src/platform/db`: database connections and migrations
- `src/platform/config`: environment and persisted configuration infrastructure
- `src/platform/web`: HTTP and web-platform infrastructure

When ownership is unclear, place business behavior in the most specific feature module rather than `shared` or `platform`.

## High-risk areas

Treat these paths as high risk and inspect their callers, tests, and operational runbooks before editing:

- `src/modules/forecourt/**`
- `src/modules/transactions/**/fiscalization/**`
- `src/modules/fiscal-inbox/**`
- `src/platform/db/**`
- `src/platform/runtime/**`
- `src/platform/security/**`
- `app/api/setup/**`
- `app/api/admin/**`
- `scripts/migrations/**`
- `server.ts`, `start.cjs`, and worker entrypoints

Preserve idempotency, leases, retries, transaction correlation, auditability, shutdown behavior, and redaction.

## Security rules

- Never commit private keys, certificates, passwords, tokens, connection strings, or production payloads.
- Development certificates belong in ignored `.certs/` or an external path, never `public/`.
- Do not log fiscal credentials, customer PII, raw authorization headers, session cookies, or unredacted database URLs.
- Public setup and operational endpoints require an explicit threat model.
- Keep CSRF enabled for authenticated mutations unless the route has a documented exception.
- Do not weaken role checks to make tests pass.

## Generated files

Do not commit:

- `vpos-server.cjs`
- `.next/`, build output, coverage output, or TypeScript build metadata
- `.config/*.log`
- generated DOMS/JPL evidence reports
- `.agent/files.json`, `.agent/imports.json`, `.agent/public-api.json`, or `.agent/symbols.json`

The only committed agent artifact should remain small and reviewable, such as `.agent/manifest.json` and architecture baselines.

## Coding conventions

- TypeScript strict mode is enabled.
- Use single quotes and repository Prettier settings.
- Prefer named types and schemas at external boundaries.
- Avoid adding `any`; narrow unknown input with Zod or explicit guards.
- Keep route and component shells small. Extract orchestration, state, and transformations when a file becomes difficult to review.
- Preserve existing public API names unless a compatibility path is intentionally added.
- Do not add source-modifying behavior to commands named `lint`, `check`, or `test`.

## Testing rules

Use the closest appropriate layer:

- unit tests for parsers, mappers, policies, reducers, and pure transformations;
- repository tests for persistence behavior;
- route-contract tests for auth, CSRF, validation, and response shapes;
- worker tests for leases, retries, idempotency, shutdown, and recovery;
- focused integration tests for DOMS/JPL and fiscalization paths.

Useful commands:

```bash
npm test
npm run test:audit
npm run test:jpl-protocol
npm run test:coverage:focused
npm run test:vendor
```

Private-package fallback tests are useful locally, but vendor contract tests must run with authenticated private dependencies before release.

## Documentation rules

Every active document is one of:

- authoritative current design or policy;
- runbook operator procedure;
- ADR accepted decision;
- generated compact metadata.

Implementation pass notes, evidence snapshots, completed TODOs, and superseded procedures belong in `docs/archive/`. Do not add a new top-level document when an existing authoritative document can be updated.

## Handoff checklist

Before completing a task, report:

- files changed;
- operational behavior affected or explicitly unchanged;
- tests and checks run;
- checks that could not run and why;
- follow-up work that was deliberately excluded.
