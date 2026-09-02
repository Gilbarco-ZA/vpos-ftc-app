# Startup Flow

**Type:** authoritative

The custom server starts in this order:

1. Apply runtime environment defaults.
2. Acquire the process guard.
3. Install console capture and initialize startup status.
4. Run minimum database bootstrap and migrations.
5. Bind HTTP or explicitly configured HTTPS.
6. Expose `/api/livez` and `/api/startup/status` while Next.js prepares.
7. Prepare Next.js and make the UI request handler available.
8. Run the exclusive legacy import, if input is present.
9. Attach the forecourt WebSocket layer.
10. Load database-backed forecourt configuration and start its watcher.
11. Start the embedded local runtime and mark startup ready. The runtime starts the station-scoped ATG polling worker; it remains idle unless `atg_polling_enabled` is true.

PostgreSQL database creation, schema migration, and first-boot initialization are process-global single-flight operations. This remains true even when the Next.js/custom-server runtime loads the same source through multiple compiled module graphs, so duplicate bootstrap callers cannot each hold a pool connection while waiting on the same advisory lock. The PostgreSQL pool is likewise process-global.

JPL adapter startup is single-flight within the process. If multiple startup paths request the adapter concurrently, they await the same in-progress connection/logon operation instead of creating duplicate clients, protocol listeners, or transaction-buffer reconciliation sweeps.
A JPL replacement client is not created until teardown of the previous physical DOMS socket has completed. Startup transaction-buffer reconciliation is paced and completes before conservative fallback polling begins. Normal JPL event-history writes and inbound replay/event handling then run behind bounded process-wide queues, and fallback polling defers itself while those queues or PostgreSQL are under pressure.

The legacy import is intentionally completed before forecourt services initialize because those paths can initialize the JPL adapter.

A failure after the web server is listening places startup in a degraded state rather than hiding the error. Liveness means the process is running; readiness means required initialization has completed.
