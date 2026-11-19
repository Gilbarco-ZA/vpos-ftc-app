# FTC CPB539 Node 22 suspend persistence acknowledgement

This change pairs with the opt-in generated `persist.sh` in the shared `mono-package-mgr` compliance branch. It is **not** active in the currently installed t060 package.

## What the app now acknowledges

When `stop.sh suspend` calls the package-generated hook during a runlevel 5 -> 3/4/6 transition:

1. The hook uses a 0600 token rotated at application startup under `/tmp/fccapps/vposftc/.vpos-lifecycle-token`.
2. The HTTP server permits authenticated `POST /_vpos/internal/persist` only from loopback.
3. The app rejects new HTTP work and new forecourt WebSocket commands.
4. It stops its runtime workers and configuration watcher, propagating worker-stop failures rather than silently suppressing them.
5. It waits for in-flight HTTP requests and known JPL persistence, event processing, and materialization queues to report zero pending/active work across three samples. Any reported failed jobs block acknowledgement.
6. It performs a live PostgreSQL `SELECT 1` health check before returning `{ "ok": true, "status": "persisted" }`.

This is **not** a blanket guarantee for every possible asynchronous task or hardware write completion. Queue gaps, database errors and deadlines must be evaluated in lab acceptance. The broader durability/forecourt shutdown requirements must still be validated with reproducible data and platform transitions.

This is a quiescing operation, not a passive probe. Do NOT invoke the endpoint or `persist.sh` manually on a running application.

## Scope and deployment

- `.config/config.js` opts into the generated lifecycle hook **only** for the CPB539 Node22 package target.
- The package builder must contain the corresponding `enableNodeWebPersistHook` and `persistHookPort` implementation.
- CPB579 Node22 behavior remains unchanged pending lab hardware.
- Sign/build using a new `tNNN` version. Azure Repos mirroring is performed manually.
- Preserve existing customer data; do not delete `/opt/fccapps/vpos-perm/vposftc`.

## Validation before hardware

```sh
node --test tests/runtime/cpb539Node22SuspendPersistence.test.mjs
npm run typecheck
npm run server:gen
npm test
```

Also run the package manager's generated-hook tests. Validate the final IPK carries the generated `persist.sh` and bundled server code. A successful build is not yet a proven platform lifecycle result.

## Hardware acceptance

First rerun the earlier read-only installation/runtime checks and the `--precheck` lifecycle gate. Only if they pass, schedule the vendor-supported runlevel 5->4 transition in an isolated lab window, verify `suspend.status` reports `hook=confirmed`, `quiesced=yes`, `status=complete`, then resume 4->5. Confirm that OPKG and DOMS package metadata are unchanged, exactly one Node instance returns, health recovers, and known customer database rows/configuration survive.

Do not manually call `rc.app` to mimic a platform transition, and do not use the runlevel test to imply that cross-version OPKG upgrade has been validated.
