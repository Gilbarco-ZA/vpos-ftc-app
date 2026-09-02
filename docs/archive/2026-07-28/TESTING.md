# Test Strategy and Execution

This document defines the repeatable test contract for the VPOS FTC application.

## Current baseline

The current test inventory contains:

- 103 discovered test files;
- 101 TypeScript test modules and 2 MJS test modules;
- 2 private-package contract files and 3 test files that import private packages;
- zero committed `.only`, unconditional `.skip`, or `.todo` tests;
- zero timer-based concurrency tests;
- 20 deliberate source/architecture guard files.

The last complete dependency-backed baseline remains 559 test nodes, 557 passes, 2 conditional vendor-contract skips, and zero failures. Phase 6G additionally validates 78/78 aggregate JPL nodes and 43/43 orchestration/persistence nodes in the dependency-isolated runner.

Node's built-in coverage runner reported the following `src/**` baseline:

| Metric    | Coverage |
| --------- | -------: |
| Lines     |   66.56% |
| Branches  |   76.76% |
| Functions |   66.61% |

Coverage is a diagnostic baseline, not yet a release threshold. New or materially changed business policy should include behavioral tests even when nearby source-guard tests already exist.

## Commands

Run the complete application test suite:

```bash
npm test
```

List every discovered test file:

```bash
npm run test:list
```

Audit the suite inventory and fail when a focused `.only` test is committed:

```bash
npm run test:audit
```

Run Node test coverage over `src/**/*.ts` and `src/**/*.tsx`:

```bash
npm run test:coverage
```

Run the focused operational-service and JPL lifecycle coverage gates:

```bash
npm run test:coverage:services
npm run test:coverage:jpl-client
npm run test:coverage:jpl-remaining
npm run test:coverage:jpl-pricing
npm run test:coverage:jpl-status-reads
npm run test:coverage:jpl-orchestration
npm run test:coverage:focused
```

Run a subsystem or one file:

```bash
node scripts/run-tests.mjs --match tests/forecourt
node scripts/run-tests.mjs --match tests/runtime/jplProtocol.test.ts
```

Require the real private Gilbarco packages and execute the vendor contract tests:

```bash
npm run test:vendor
```

Authenticated CI can require all private dependencies for the complete suite:

```bash
npm run test:ci
```

## Focused coverage gates

The Phase 6B through 6G behavioral passes add regression gates for previously under-tested operational paths. These are minimum floors, not completion targets.

| Profile                  | Included behavior                                                                                                                       |  Lines | Branches | Functions | Enforced floor  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -----: | -------: | --------: | --------------- |
| `operational-services`   | receipt generation and mapping, fiscal inbox transitions/mapping, dynamic tank normalization and compact diagnostics                    | 96.84% |   82.34% |    96.63% | 90% / 65% / 85% |
| `jpl-client`             | aggregate JPL facade, orchestration, evidence persistence, extracted command handlers, status/read helpers, and shared protocol modules | 95.13% |   88.48% |    98.48% | 93% / 87% / 95% |
| `jpl-remaining-commands` | pricing, dynamic-tank, aggregate-delivery, timeout/subcode runtime, and gateway snapshot behavior extracted during Phase 6D             | 89.78% |   72.80% |    97.01% | 85% / 65% / 90% |
| `jpl-pricing`            | price/date normalization, price-bank mapping, current/pending reads, clear operations, scheduling validation, and queue verification    | 98.71% |   87.96% |   100.00% | 90% / 80% / 90% |
| `jpl-status-reads`       | fuelling-point, tank, delivery, controller, service-log, and back-office reads with degraded-subcode behavior                           | 96.81% |   90.24% |   100.00% | 95% / 88% / 95% |
| `jpl-orchestration`      | gateway start single-flight, APC1 queue recovery, facade routing, service-message persistence, and empty back-office handling           | 91.84% |   82.58% |    97.30% | 90% / 80% / 95% |

The JPL facade now owns access control, configuration resolution, and command-family routing. Gateway startup and APC1 serialization live in `src/platform/integrations/jpl/orchestration.ts`; collected service-message and back-office evidence persistence lives in `src/platform/integrations/jpl/specialRecordPersistence.ts`. Lifecycle/status, controller records, pump control, transaction replay, tank operations, direct protocol commands, pricing, dynamic tank data, and aggregate tank deliveries live under `src/platform/integrations/jpl/commands/`. Timeout/subcode fallback, gateway snapshot state, and low-level status/read requests live under `src/platform/integrations/jpl/protocol/`.

Architecture guards prevent extracted branches and helper definitions from returning to `client.ts`, cap the client facade below 330 lines, keep `commands/pricing.ts` as a compatibility facade below 60 lines, and cap `protocol/statusReads.ts` below 380 lines. The authenticated vendor contract verifies that the private DOMS package accepts the degraded status subcodes used by the application.

The receipt generator and JPL lifecycle functions expose optional dependency overrides. The JPL runtime contract also permits a test-only command queue override, while orchestration and special-record persistence expose direct injectable boundaries. Production calls remain unchanged, while tests can supply database, gateway, queue, configuration, logger, repository, and renderer doubles without opening sockets or connecting to PostgreSQL.

## Discovery and isolation

`scripts/run-tests.mjs` discovers these file forms recursively under `tests/`:

- `*.test.ts`
- `*.test.tsx`
- `*.test.mjs`
- `*.test.cjs`
- `*.spec.ts`
- `*.spec.tsx`
- `*.spec.mjs`
- `*.spec.cjs`

This closes the previous gap where `tests/config/legacy-import-paths.test.mjs` was silently excluded.

The default runner uses Node's test-process isolation with bounded concurrency and a per-test timeout. Operators can override these values without editing source:

```bash
VPOS_TEST_CONCURRENCY=2 VPOS_TEST_TIMEOUT_MS=60000 npm test
```

Tests must not rely on execution order or shared state across files.

## Private package policy

The application depends on:

- `@gilbarcoafs/doms-pos-jpl`
- `@gilbarcoafs/vpos-common`

When those packages are installed, the normal test command uses the real modules. When they are unavailable, the runner registers narrow test-only fallback modules so application tests can still execute.

The fallback JPL client is deliberately fail-fast for connection, logon, request, and send operations. It exists only to allow import-time evaluation and pure protocol fallback paths. Tests that exercise runtime JPL behavior must inject a purpose-built client double or run in the authenticated environment.

`tests/contracts/privatePackages.test.ts` and `tests/contracts/jplStatusSubcodes.contract.test.ts` are conditionally skipped under fallback mode and become mandatory under `npm run test:vendor` or `npm run test:ci`.

The fallback registration is only loaded by the test runner. It is not included in production module resolution.

## Test categories

The suite contains four complementary test styles:

1. **Behavioral unit tests** for policy, normalization, mapping, validation, retention, and supervisor behavior.
2. **Protocol and workflow tests** for DOMS/JPL transactions, replay, authorization, wetstock, maintenance, fiscalization, and proxy routing.
3. **Source/architecture guards** that prevent removed duplication, insecure persistence, invalid route boundaries, or deprecated writers from returning.
4. **Vendor contract tests** that confirm authenticated private packages expose the minimum runtime API used by the application.

Source guards are appropriate for migration invariants but must not replace behavioral tests for parsing, decision logic, error handling, or state transitions.

## External effects

Default tests must not require:

- a running PostgreSQL instance;
- live DOMS/PSS hardware;
- fiscal authority endpoints;
- local printers;
- external network access.

The supervisor suite now injects heartbeat, recovery, inbox, and sleep dependencies. This removed unintended PostgreSQL connection attempts and multi-second real-time delays from ordinary tests.

Live hardware, simulator, fiscal endpoint, deployment, and commissioning evidence remains governed by the dedicated DOMS and Tanzania validation runbooks.

## Adding tests

- Place tests near the matching domain folder under `tests/`.
- Prefer explicit input/output assertions over snapshots of broad objects.
- Use deferred promises instead of real timing delays for concurrency tests.
- Inject database, clock, sleep, network, and vendor-client dependencies.
- Restore mutated environment variables and global state within the same test file.
- Add a source guard only when it protects a durable architecture or data-ownership invariant.
- Never commit `.only`; `npm run test:audit` rejects it.
- Do not hide unavailable infrastructure with unconditional skips. Use the explicit vendor contract boundary or a documented integration gate.
