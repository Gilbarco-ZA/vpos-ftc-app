# DOMS remaining-work classification

The DOMS/JPL first-production scope is now code-complete. Remaining work is separated from implementation so field, endpoint, and approval tasks no longer appear as unfinished application code.

## Core code status

There are no unresolved core implementation items for the first production scope. Dispense, wetstock, persistence, reconciliation, diagnostics, simulator support, live read-only validation, maintenance planning, deployment approval, and controlled one-time PSS write execution are implemented.

The controlled write path remains disabled by deployment configuration until field validation and a current digest-bound deployment approval exist.

## Local release verification

Run the consolidated release-evidence command on every final handoff:

```bash
npm run doms:release:evidence
```

It runs the build, full test suite, JPL protocol tests, simulator self-test, simulator validation, and TODO progress regeneration. The command stops on the first failure and writes a machine-readable report to:

```text
artifacts/doms-release-evidence.json
```

A custom output path can be supplied:

```bash
npm run doms:release:evidence -- ./evidence/site-a-release.json
```

## Field validation

Field validation remains required for live decimal scaling, complete pump-status payloads, preset/start-limit behavior, delivery lifecycle, multi-pump operation, wetstock operation, controlled network interruption, stale-lock recovery, PSS Configurator reconciliation, and the approved one-time write path.

## Tanzania endpoint validation

TRA and EWURA live acceptance remains external to the codebase. It requires production-like credentials, endpoints, and fiscal authority responses.

## Deferred scope

- DOMS EPT/payment remains deferred from the first production release and must be treated as a separate security-focused phase.
- `FcAuxCmd` remains out of scope until a concrete business workflow is approved.
- Additional typed `FcStatus` subcodes remain evidence-driven. Unknown variants are retained in raw diagnostics and do not crash the runtime.

The machine-readable classification is maintained in `DOMS_REMAINING_WORK.json`.
