# Tanzania fiscalization route cutover checklist

This checklist controls movement between the FTC-native local Tanzania fiscalization path (`local_tz`) and proxy/cloud fiscalization (`proxy`). It is intentionally conservative: switching routes while TRA, EWURA, or proxy queues still contain open work can duplicate receipts, strand EWURA retries, or hide failed fiscal evidence from support.

## Route switch safety gate

The admin Tanzania fiscal setup API evaluates route-switch safety before persisting a different `station_settings.fiscalization_transport` value. A switch is blocked when the target route is invalid for the station or when open queue work would be orphaned by the route change.

The safety result includes:

- the current and target route;
- blockers and warnings;
- queue counts for local transaction/report queues, TRA z-reports, EWURA registration/transaction/report queues, and proxy-eligible transactions;
- configuration evidence for TRA, EWURA, proxy URL, and signing artifacts;
- a cutover checklist for the detected direction.

The API returns HTTP `409` with code `TANZANIA_ROUTE_SWITCH_BLOCKED` when a route change has blockers. The UI shows the same blocker list in the Tanzania fiscal setup page.

## Switching from local Tanzania to proxy/cloud

Use this when the cloud service is ready to fiscalize Tanzania transactions.

1. Schedule a maintenance window or pause new sales at the POS.
2. Let the local Tanzania transaction queue drain to zero open `PENDING`, `PROCESSING`, or `FAILED` rows.
3. Let TRA z-report work complete; do not switch mid fiscal-day close.
4. Let EWURA registration, transaction, and report queues drain or explicitly reconcile failures.
5. Confirm the cloud/proxy endpoint is configured and reachable from the FTC app.
6. Switch `station_settings.fiscalization_transport` to `proxy` only after the safety result has no blockers.
7. Send a controlled live transaction through proxy/cloud and confirm the fiscal receipt evidence returns to FTC.
8. Keep the local TRA/EWURA artifacts until the first cloud fiscal day closes cleanly and evidence has been archived.

## Switching from proxy/cloud to local Tanzania

Use this when a site must send directly to TRA/EWURA from the FTC app.

1. Confirm the station country resolves to Tanzania and `station_settings.fiscalization_engine` is `TZ`.
2. Drain proxy/cloud work and resolve any failed proxy submissions.
3. Confirm there are no transactions still eligible for proxy fiscalization.
4. Confirm TRA base URL, token username/password, VFD registration data, and signing key are stored in DB/secure artifacts.
5. Confirm EWURA endpoint, API source ID, registration data, and retry worker are configured.
6. Switch `station_settings.fiscalization_transport` to `local_tz` only after the safety result has no blockers.
7. Send a controlled low-value sale and credit-note validation and capture TRA/EWURA evidence.
8. Record acceptance evidence in the deployment notes.

## Operational rule

Never switch route while any open queue row exists unless a field engineer has manually reconciled that row and recorded why it is safe to ignore. The code gate blocks the common unsafe states; manual evidence is still required for final deployment sign-off.
