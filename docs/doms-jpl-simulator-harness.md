# DOMS/JPL simulator harness

This pass adds a deterministic local JPL simulator so the station app can validate socket, logon, heartbeat, unsolicited status, reject, transaction-recovery, wetstock, wash, and optional-module flows without a live DOMS/PSS controller.

The simulator is not a replacement for field validation. It is a protocol-shaped harness for repeatable development checks, integration tests, and operator workflow rehearsal before a site points the app at a real PSS.

## Start the simulator

```bash
npm run doms:jpl-sim -- --port 8888 --scenario full --verbose
```

Then point the FTC forecourt runtime at:

```text
host: 127.0.0.1
port: 8888
mode: jpl_tcp
secure: false
```

Useful variants:

```bash
npm run doms:jpl-sim -- --scenario minimal --fp-count 2
npm run doms:jpl-sim -- --scenario transaction-recovery --fp-count 4
npm run doms:jpl-sim -- --scenario wetstock --tank-count 3
npm run doms:jpl-sim -- --scenario optional-modules --price-pole-count 1 --wash-point-count 1 --sensor-count 2 --vending-count 1
```

TLS can be started when a local certificate/key pair is available:

```bash
npm run doms:jpl-sim -- --secure --port 8889 --tls-cert ./cert.pem --tls-key ./key.pem
```

## Scenarios

| Scenario               | Purpose                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `minimal`              | Basic welcome, heartbeat, logon, FcStatus, and pump status.                                               |
| `readiness`            | Adds warning-oriented forecourt status so operational-readiness panels can be reviewed.                   |
| `transaction-recovery` | Adds supervised and unsupervised fuel transaction fixtures that remain stable until explicit clear calls. |
| `wetstock`             | Adds tank status, full tank data, delivery status, and delivery data fixtures.                            |
| `optional-modules`     | Adds price pole, wash, DIO, sensor, and vending module fixtures.                                          |
| `full`                 | Enables all fixture families. This is the recommended local commissioning rehearsal scenario.             |

## Implemented protocol behavior

The harness sends the JPL welcome message immediately after socket connection, uses STX/ETX framing, accepts multiple frames per TCP chunk, retains partial frames until completed, and sends server heartbeats on a configurable interval.

Request handling currently covers:

- `FcLogon_req`, including startup unsolicited messages.
- `FcStatus_req`, `FcInstallStatus_req`, `PosConnectionStatus_req`, and `PssPeripheralsStatus_req`.
- Pump status, info, fuelling data, errors, supervised/unsupervised transaction reads, unlocks, and clears.
- Tank gauge status, tank gauge data, tank-control status, delivery status, delivery data, and clear acknowledgements.
- Service-log, Back Office Record, and client-data backup request families.
- Price pole, wash, digital I/O, sensor, and vending status/error/totals families.
- Generic operational acknowledgements for supported write-preview command names.
- `RejectMessage_resp` for unsupported or malformed messages, preserving correlation IDs when available.

## Development checks

The harness has focused tests in:

```text
tests/forecourt/domsJplSimulator.test.ts
```

These tests cover frame encoding/extraction, logon startup fixtures, correlation ID round-tripping, reject responses, and transaction recovery fixture stability.

## Field validation boundary

The simulator intentionally uses stable sample values. It does not emulate vendor-specific timing quirks, pump firmware behavior, locked transaction races, fiscal device dependencies, or all device-specific error states. A real DOMS/PSS simulator or live controller still remains the release gate for deployment sign-off.

## Session resilience self-test

A dedicated resilience pass can be run without a second process:

```bash
npm run doms:jpl-session:selftest
npm run doms:jpl-session:selftest -- --json-out ./doms-jpl-session-report.json
```

It validates the welcome/logon/bootstrap path, bidirectional heartbeats, forced socket interruption, reconnect, stable transaction recovery, and dead-connection classification. The simulator server exposes `getStats()`, `disconnectClients()`, `pauseHeartbeats()`, and `resumeHeartbeats()` for deterministic tests. These controls are local harness features and are not part of the DOMS protocol surface.
