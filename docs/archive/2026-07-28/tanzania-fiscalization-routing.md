# Tanzania fiscalization routing

Tanzania fiscalization is selected per station in the database. Production sites do not require shipped `.env` files to decide whether transactions are fiscalized locally or through the proxy/cloud service.

## Station settings

`station_settings.fiscalization_engine` identifies the fiscal engine. Tanzania stations must use `TZ`.

`station_settings.fiscalization_transport` selects the runtime route:

- `local_tz` - the in-app Tanzania fiscalization worker sends directly to TRA and EWURA using the DB-backed Tanzania fiscal modules.
- `proxy` - the proxy/cloud sender claims transactions and submits them to the configured proxy/cloud service.

The route is managed in **Admin > Tanzania fiscal setup** using the fiscalization route safety switch.

## Safety rules

- `local_tz` is only valid when the station country is Tanzania and `fiscalization_engine` is `TZ`.
- If `local_tz` is requested for another country, the route resolver falls back to `proxy` and returns a reason.
- The proxy claim SQL only claims stations where `fiscalization_transport = 'proxy'`.
- The local transaction fiscalization queue only claims stations where `fiscalization_transport = 'local_tz'`.
- Credit notes follow the same route: `local_tz` credit notes are processed by the local Tanzania worker and `proxy` credit notes are processed by the proxy/cloud sender.
- Runtime workers may both be started, but only the worker matching the station route is allowed to claim normal transaction or credit-note fiscalization work.

## Credit notes

Credit-note queue items use `payload.kind = 'CREDIT_NOTE'` and are deliberately handled separately from normal sales transaction queue items. This keeps the reversal path auditable and prevents the local worker from treating a credit note as another sale.

For `local_tz`, the app builds and sends a Tanzania TRA credit-note receipt through the DB-backed local fiscal modules, then submits the corresponding EWURA sales transaction payload as a reversal. The TRA receipt counters are independent from the original sale receipt counters and are persisted back to `credit_notes.proxy_response.localTanzania` before the TRA request is sent so retries reuse the same credit-note receipt number.

For `proxy`, the proxy/cloud sender claims only proxy-routed credit-note queue items and submits the existing proxy credit-note DTO.

## Cloud cutover

When the Tanzania cloud fiscalization service is ready, switch the station from `local_tz` to `proxy` in the Tanzania fiscal setup screen. The change is audited with the old and new route.

Do not use developer `.env` values as the production source of truth for this switch.

The setup API now evaluates route-switch safety before persisting a different transport. It blocks a switch when open local/proxy queues, EWURA retry rows, TRA z-report rows, or missing required local TRA config would make the target route unsafe. See [`tanzania-cloud-cutover.md`](./tanzania-cloud-cutover.md) for the operator checklist.
