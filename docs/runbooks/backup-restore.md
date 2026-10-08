# Backup retention and database restore

The administrator Data maintenance panel at `/admin/control` provides database dump and full ZIP creation, download, deletion of older backups, and database dump restoration.

## Delete an older backup

1. Confirm that a newer backup appears in the list and download external copies required by site retention policy.
2. Select **Delete** on an older item. The most recent backup is protected in both the UI and API.
3. Type `DELETE <filename>` and confirm. The API repeats the retention check against current backup inventory and removes only a validated backup filename.

`DELETE /api/admin/system/backups/{filename}` requires an administrator session, CSRF header/body tokens, and JSON body `{"confirmation":"DELETE <filename>","csrf_token":"..."}`.

## Restore a database dump

**Maintenance-window operation.** Stop transaction-generating and external worker traffic before using this control. A running process may hold database connections or issue writes during recovery; a single-transaction pg_restore protects against partial SQL application but does not freeze other writers.

1. Download and securely store a known-good backup outside this device.
2. Make sure `pg_dump` and `pg_restore` are installed on the station, with compatible PostgreSQL versions, and production `start.sh`/`stop.sh` are available.
3. Choose **Restore** beside a database or pre-reset `.dump` file, type `RESTORE <filename>`, and confirm.
4. The application validates the custom-format dump, creates a pre-restore safety dump, uses `pg_restore --clean --if-exists --single-transaction --exit-on-error` on the existing application database, and requests an application restart.
5. Verify application health, schema readiness, station configuration, transaction data, and worker state before reopening the site. If restoration fails, use the retained safety dump and a controlled offline recovery procedure.

`POST /api/admin/system/backups/{filename}/restore` requires administrator auth, CSRF, and JSON body `{"confirmation":"RESTORE <filename>","csrf_token":"..."}`. Never expose this endpoint to partners.

## Full ZIP restoration

The full backup includes a PostgreSQL dump and the persistent VPOS data directory, but excludes binaries, service scripts, and environment secrets. The online Restore button is intentionally unavailable for full `.zip` backups. Restore full backups **offline** using a controlled procedure that verifies `manifest.json`, re-deploys a compatible VPOS application version, restores the PostgreSQL dump, and reinstates persistent files while services are stopped. Never extract untrusted ZIP paths over a live station.

## Operational caveats

- The newest-backup rule concerns backups on this device, not copies elsewhere.
- The retention check guards normal requests, but concurrent administrators should not perform maintenance operations in parallel. Introduce a cross-process maintenance lock before permitting unattended automation.
- A restore triggers a restart request, not a synchronous health check. Inspect logs and perform post-restore validation.
- The pre-restore dump uses the existing pre-reset naming convention. Retain it until recovery has been verified.
