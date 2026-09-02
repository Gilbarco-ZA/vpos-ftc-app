# Architecture

**Type:** authoritative

## System shape

VPOS FTC is a modular monolith with multiple process entrypoints. The Next.js application, custom server, embedded runtime, and optional dedicated workers share the same modules and PostgreSQL persistence model.

```text
Browser
  -> Next.js pages and route handlers
  -> module application services
  -> domain policies and contracts
  -> repositories, integrations, runtime services
  -> PostgreSQL / DOMS-JPL / vpos-proxy / filesystem compatibility inputs
```

## Boundaries

- `app/` owns routing and HTTP adaptation.
- `components/` owns reusable presentation.
- `src/modules/` owns feature behavior.
- `src/platform/` owns generic infrastructure.
- `src/shared/` owns dependency-light utilities and integration contracts. It must not import feature modules.

New API routes must not import `src/platform/db/**` or feature `infrastructure/**` directly. During migration, existing exceptions should be removed through application commands and queries rather than copied.

Domain code must not depend on Next.js, React, database clients, the filesystem, or process environment. Infrastructure implements domain/application contracts.

## Runtime entrypoints

- `server.ts`: custom web server, startup bootstrap, legacy import, forecourt attachment, and local runtime startup
- `start.cjs`: production wrapper and diagnostics
- `scripts/worker.ts`: omnibus worker runtime
- `server/index.ts`: focused forecourt server entrypoint
- `workers/**`: focused process entrypoints

The production build generates `vpos-server.cjs`; it is a package artifact, not source.

## Persistence

PostgreSQL is the primary datastore for station configuration, operational records, transactions, fiscalization state, receipts, queue state, heartbeats, and diagnostics. The application has no direct cloud-database connection. All cloud-bound transaction, fiscalization, product, stock, and tank traffic crosses the local `vpos-proxy` boundary. Filesystem inputs remain compatibility surfaces and must not become competing canonical stores.

## Reliability principles

- Make fiscalization and queue processing idempotent.
- Use leases or advisory locks for singleton work.
- Persist retry and failure state where recovery must survive process restarts.
- Expose liveness separately from readiness and startup progress.
- Keep startup migration/bootstrap work bounded and observable.
- Redact secrets and customer data from logs and support bundles.

## Multi-country and `vpos-proxy` evolution

The modular-monolith boundary is established and architecture checks protect the most important route, shared, and domain dependency rules. Tanzania fiscalization, DOMS/JPL integration, database-backed country datasets, transaction delivery, and operational workers are substantial implementations rather than prototypes. The next architecture milestone is to make country behavior and `vpos-proxy` transport independently extensible so that adding countries does not add conditionals and endpoint knowledge throughout transaction, stock, setup, and worker code.

### Current progress

- **Modular structure:** `app -> modules -> platform/shared` is the intended dependency direction and is enforced for the current tracked rules.
- **Country catalog:** country data is database-backed and can support additional country datasets without hard-coding UI choices.
- **Tanzania:** Tanzania fiscalization and proxy registration are advanced and have dedicated contracts, workers, tests, and operational controls.
- **Country behavior:** behavioral extensibility is behind catalog extensibility. Country normalization and Tanzania-specific decisions still appear in multiple orchestration and configuration paths.
- **`vpos-proxy` integration:** proxy delivery is functional, but URL resolution, transport behavior, endpoint ownership, DTO ownership, and response handling are distributed across multiple feature implementations.
- **Migration debt:** some large orchestration units and cross-feature dependencies remain. These should be reduced before several additional countries are introduced.

### North-star boundary

FTC decides **which business operation** must happen and supplies validated, country-aware business data. The local `vpos-proxy` decides **how that operation reaches cloud/external services**, including cloud destination selection, offline/retry behavior, identity, and country-specific upstream endpoint routing.

For country-neutral operations, FTC should call stable local proxy operations such as invoice, credit-note, product, and stock submission without selecting a country cloud URL. Country-specific operations such as Tanzania TRA/EWURA registration, daily totals, or tank inventories may have explicit local proxy operations, but those paths should still be declared in one proxy endpoint registry instead of being assembled throughout feature code.

The target dependency shape is:

```text
Transactions ─┐
Stock ────────┤
Products ─────┤
Setup ────────┼──> CountryRegistry / CountryProfile
Country fiscal┤                │
modules ──────┘                └──> payload/capability policy
        │
        └──────────────────────────> VposProxyGateway
                                      │
                                      ├── ProxyTargetResolver
                                      ├── ProxyTransport
                                      ├── EndpointRegistry
                                      ├── response/error normalization
                                      ├── idempotency
                                      └── observability
                                               │
                                               v
                                           vpos-proxy
```

### Country capability model

Country codes should be canonical values and normalized once at an application boundary. Country-specific behavior should be selected through an explicit profile/capability registry rather than central `if country === ...` branches.

Conceptually:

```ts
interface CountryProfile {
  code: string
  capabilities: ReadonlySet<ProxyOperation>
  invoiceMapper: ProxyInvoiceMapper
  creditNoteMapper?: ProxyCreditNoteMapper
  validateConfiguration(configuration: StationConfiguration): ValidationResult
}
```

Adding a country should primarily add a country profile, its mappings/validators, and contract tests. It should not require editing proxy transport, URL selection, generic transaction workers, or unrelated country modules.

Country **data** such as currency, timezone, tax catalogues, units, product classifications, aliases, and feature enablement may remain database/configuration driven. Country **behavior** such as regulatory payload transformation, signatures, validation algorithms, response interpretation, and reconciliation should remain version-controlled code.

### `vpos-proxy` ownership rules

- One `VposProxyGateway` should own outbound local-proxy HTTP behavior.
- One `ProxyTargetResolver` should own target precedence and base-path resolution for every feature.
- One endpoint registry should map logical operations to local proxy method/path contracts.
- Feature modules should not independently construct proxy base URLs or cloud destinations.
- Country modules may own country-specific payloads and operation capabilities, but they should depend on the generic proxy gateway rather than importing transport from another feature module.
- Transaction infrastructure must not become the shared owner of Tanzania, stock, product, or future-country proxy contracts.
- Proxy response/error normalization and idempotency behavior should be uniform across features.

### Migration checklist

Use this checklist when planning multi-country and proxy-related changes. Keep completed items checked in the same pull request that establishes the corresponding invariant.

#### Phase 1 - Unify proxy transport without behavior changes

- [ ] Introduce a single `VposProxyGateway` for all FTC-to-`vpos-proxy` requests.
- [ ] Introduce a single `ProxyTargetResolver` and document target precedence.
- [ ] Centralize proxy timeout, headers, error parsing, response normalization, and base-path handling.
- [ ] Define a typed endpoint registry using logical operation names rather than scattered URL literals.
- [ ] Migrate transactions, stock, products, setup, and Tanzania fiscal operations to the gateway incrementally.
- [ ] Add contract tests proving endpoint method/path compatibility before removing legacy clients.

#### Phase 2 - Make country behavior explicit

- [ ] Introduce canonical `CountryCode` parsing/normalization and remove duplicate country alias logic.
- [ ] Introduce `CountryRegistry` / `CountryProfile` with explicit capabilities.
- [ ] Move Tanzania invoice/credit-note enrichment behind Tanzania-owned mappers.
- [ ] Give existing non-Tanzania behavior an explicitly named generic/legacy profile during migration.
- [ ] Implement Kenya through the same profile contracts before marking Kenya fiscalization supported.
- [ ] Add table-driven country x proxy-operation capability tests.
- [ ] Verify adding a new country does not require edits to generic proxy transport or worker scheduling code.

#### Phase 3 - Correct module ownership and dependency direction

- [ ] Remove proxy DTO/transport ownership from `transactions` where the contract is shared or country-owned.
- [ ] Break mutual `tanzania-fiscal <-> transactions` integration dependencies through platform/application contracts.
- [ ] Audit and remove other avoidable mutual feature-module dependencies.
- [ ] Add architecture rules that reject new feature-level dependency cycles.
- [ ] Add architecture rules preventing application-layer code from owning Next.js/HTTP response concerns.
- [ ] Continue reducing `src/shared` compatibility imports where platform ownership is more appropriate.

#### Phase 4 - Decompose large delivery orchestration

- [ ] Reduce `proxySenderWorker` to queue claiming/scheduling and delegation.
- [ ] Extract invoice and credit-note delivery services.
- [ ] Extract response interpretation and delivery reconciliation.
- [ ] Extract delivery persistence and retry policy.
- [ ] Keep country-specific enrichment behind country profiles rather than worker branches.
- [ ] Preserve idempotency, lease/claim semantics, and restart recovery with focused tests during decomposition.

#### Phase 5 - Retire transitional fiscalization paths

- [ ] Confirm field/external validation for the proxy-first Tanzania path with production-like TRA/EWURA credentials and failure scenarios.
- [ ] Prove retired local Tanzania fiscalization cannot be selected by normal production configuration.
- [ ] Quarantine remaining local fiscalization compatibility code while cutover evidence is incomplete.
- [ ] Remove retired local Tanzania workers, flags, queue paths, and duplicated route selection once cutover acceptance is complete.
- [ ] Update runbooks and migration documentation in the same change that removes compatibility behavior.

#### Phase 6 - Definition of done for each additional country

- [ ] Country exists in the canonical country dataset/catalog with aliases and required metadata.
- [ ] Country profile declares supported proxy operations explicitly.
- [ ] Payload mappers and validation are version-controlled and covered by contract tests.
- [ ] No country cloud URL is introduced into FTC for an operation owned by `vpos-proxy`.
- [ ] Proxy endpoint contract tests pass for every operation the country enables.
- [ ] Transaction, stock, product, setup, and fiscal workflows use the shared proxy gateway.
- [ ] Unsupported operations fail explicitly instead of falling back to another country's behavior.
- [ ] Secrets/certificates are never persisted in plain station configuration or rendered back to the browser.
- [ ] Operational retry, idempotency, reconciliation, and observability behavior is verified.
- [ ] Architecture, documentation, typecheck, and relevant domain/integration tests pass before merge.

### First implementation milestone

The lowest-risk first milestone is: **all calls to `vpos-proxy` use one transport and one target resolver with no functional payload or endpoint changes**. Establish that invariant before introducing additional country profiles. Once transport ownership is stable, country capability extraction can proceed without simultaneously changing network behavior.

## Known migration boundaries

Direct API-route imports of database and feature infrastructure have been removed. Feature-owned behavior has also been moved out of `src/shared`, so the `apiRouteToInfrastructure`, `sharedToFeature`, and `domainToInfrastructure` baselines are all zero. Remaining migration debt includes import cycles and large orchestration files. New work must preserve the zero baselines and reduce the remaining debt incrementally with tests at each boundary.
