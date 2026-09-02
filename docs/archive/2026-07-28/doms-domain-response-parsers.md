# DOMS/JPL domain response parsers

This pass adds a typed response-parser layer between raw DOMS/JPL envelopes and FTC-facing workflow/domain state.

## Purpose

The DOMS protocol responses are intentionally close to the controller data dictionary. That is useful for tracing, but it makes UI and application services brittle when they read raw fields such as `FpSubStates.bits.IsOnline`, `TgSubStates`, `BorData`, or nested enum/value objects directly.

The parser layer in `src/modules/forecourt/infrastructure/jpl/protocol/responses.ts` provides a stable internal response contract for the command families currently exposed through the app:

- connection, heartbeat, welcome, reject, POS connection, and PSS peripheral responses
- forecourt controller status, installation status, operation mode, and price status responses
- dispense status, information, fuelling data, errors, totals, and transaction responses
- wetstock tank status, tank data, delivery status, and delivery data responses
- price-pole status and errors
- wash status, errors, and unsupervised transaction responses
- digital I/O, sensor, vending status/error/totals responses
- service-log, Back Office Record, and client-data backup responses
- acknowledgement responses for operational commands

## Runtime snapshot API

A new admin API exposes the app-facing domain snapshot without requiring callers to understand raw JPL field names:

```text
GET /api/admin/forecourt/domain-snapshot
```

The response includes:

- connection health and stale-connection detection
- forecourt controller snapshots
- compact pump status by `FpId`
- compact tank status by `TgId`
- optional-module summaries for price poles, wash, DIO, sensors, and vending
- recent special records
- parser coverage inventory

The production workflow overview also includes this snapshot under `domainSnapshot` so support and admin UI screens can migrate away from raw adapter-state assumptions incrementally.

## Safety and compatibility

The parser layer is read-only. It does not send DOMS/PSS commands, mutate controller state, or change existing persistent capture flows. Raw payloads are still preserved in the adapter state and persistence tables for support, replay, and field-debugging purposes.

## Implementation notes

- `parseDomsJplResponse` accepts a single inbound JPL envelope and returns a `ParsedDomsResponse`.
- `MultiMessage_resp` is recursively parsed and returns child parser results.
- `RejectMessage_resp` is mapped through the existing reject mapper.
- Unknown messages are surfaced as `family: 'unknown'` and `status: 'unknown'`, preserving the raw payload for diagnostics.
- `supportedJplResponseNames()` exposes the parser coverage inventory.
- `summarizeParsedDomsResponses()` provides count rollups by status and family for diagnostics and tests.

## Next steps

- Move existing admin UI tables to `domainSnapshot` instead of reading raw adapter state directly.
- Add parser fixtures for the remaining site-specific response variants discovered during field validation.
- Use parser coverage during commissioning to highlight response families observed from a controller that do not yet have typed parsers.
