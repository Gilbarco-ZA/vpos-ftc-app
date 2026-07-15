# DOMS/JPL special record processing

This pass strengthens the DOMS special-function path that collects Forecourt Controller service-log messages and Back Office Records (BORs).

## Service-log routing

`FcServiceMsg_resp` payloads are now classified as soon as they are persisted. The classifier records:

- `service_code` when a legacy service message embeds a code, or when the payload exposes an explicit service-message code.
- `route_key` and `route_label` for operator-facing grouping.
- `route_severity` as `info`, `warning`, `critical`, or `unknown`.
- `route_status` as `auto_ack`, `needs_review`, `escalated`, or `ignored`.
- `route_summary` for support-bundle and workflow review context.

Unknown messages are intentionally not discarded. They are surfaced as `unknown_service_message` with `needs_review` so support can decide whether the message requires a field runbook, a mapping rule, or a product-specific integration.

## BOR replay guarantees

BORs are already persisted before DOMS clear attempts. This pass adds a second lifecycle that is independent from the DOMS buffer clear lifecycle:

- `record_kind` identifies known DOMS BOR format IDs.
- `processing_status` tracks downstream handling separately from controller-buffer clearing.
- `replay_required` marks records that should stay visible to later replay/export processors.
- `process_attempts`, `last_replayed_at`, `next_process_at`, `processed_at`, and `processing_error` support bounded replay and escalation.

This is deliberately conservative. The first priority is to guarantee that a BOR collected from DOMS is durable before `clear_BackOfficeRecord_req` is attempted. Domain-specific BOR processors can then consume the persistent records without racing the controller buffer.

## Admin workflow visibility

The production workflow review now includes:

- service-log records requiring review
- escalated service-log records
- pending BOR replay candidates
- failed BOR replay candidates
- recent service-log clear status
- replayable BOR format/kind/status/attempt counters

## Operational notes

- Empty BOR slots are classified as `ignored` and are not replay candidates.
- Unknown BOR formats remain replay candidates until an explicit processor or runbook handles them.
- BOR processing state does not change the low-level DOMS clear state; the app can prove both whether the controller buffer was cleared and whether the collected record was processed afterwards.
