# DOMS JPL PosId session leases

The FTC runtime now claims a database-backed lease for `(stationId, PosId)` before opening a JPL connection. This prevents two physical application instances from using the same DOMS `PosId`, which can otherwise corrupt pump locks and transaction ownership.

## Behavior

- Lease acquisition happens before `createForecourt()` connects to the PSS.
- The lease is renewed every 15 seconds and expires after 45 seconds without renewal.
- A process may reacquire its own lease during reconnects.
- Another process may take over only after explicit release or expiry.
- Startup fails closed when the configured `PosId` is already held by another live client.

Apply migration `1250_forecourt_jpl_pos_sessions.sql` before deploying this pass.
