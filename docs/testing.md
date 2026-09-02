# Testing

**Type:** authoritative

The repository uses the Node.js test runner through `scripts/run-tests.mjs`. Test discovery, bounded concurrency, private-package fallback behavior, and coverage profiles are controlled by that runner.

## Core commands

```bash
npm test
npm run test:list
npm run test:audit
npm run test:coverage
npm run test:ci
npm run test:vendor
```

`test:ci` and `test:vendor` require authenticated private Gilbarco dependencies. Local fallback stubs do not replace vendor contract verification.

## Focused suites

```bash
npm run test:jpl-protocol
npm run test:coverage:services
npm run test:coverage:jpl-client
npm run test:coverage:jpl-pricing
npm run test:coverage:jpl-status-reads
npm run test:coverage:jpl-orchestration
npm run test:coverage:focused
```

## Test placement

- Pure policy, parser, mapper, and reducer tests should avoid external effects.
- Repository tests should use isolated database state.
- Route tests should cover authentication, roles, CSRF, validation, and response contracts.
- Worker tests should cover leases, retries, idempotency, shutdown, and restart recovery.
- Forecourt and fiscalization changes require focused protocol or integration coverage.

Do not commit focused `.only` tests, unconditional skips, or tests that rely on execution order.
