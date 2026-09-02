# DOMS Pump Alarm and Emergency Recovery Runbook

This runbook defines the application-side recovery boundary for DOMS fuelling-point faults. It does not replace site safety procedures, dispenser manufacturer instructions, or field-engineer authorization.

## Role policy

| Command                       | Manager | Administrator | Required condition                                         |
| ----------------------------- | ------- | ------------- | ---------------------------------------------------------- |
| `ESTOP_FP`                    | Allowed | Allowed       | Immediate safety or equipment-protection response          |
| `CLEAR_FP_ERROR`              | Allowed | Allowed       | Error cause understood and physical state checked          |
| `CANCEL_FP_ESTOP`             | Blocked | Allowed       | Emergency cause removed and site confirmed safe            |
| `RESET_FP` / `FORCE_RESET_FP` | Blocked | Allowed       | Physical inspection complete and controller state reviewed |

The API enforces this policy for both the generic `send` command and the legacy clear-error alias. Route-level authentication still limits DOMS command access to managers and administrators.

## Recovery sequence

1. Stop dispensing activity and preserve the current transaction state.
2. Read the latest `FpStatus`, pump error message, transaction-buffer status, and linked tank state.
3. Classify the fault as controller lock, price/grade, tank/delivery, communication, hardware, or operator action.
4. For a safety event, issue `ESTOP_FP` and record the pump number, operator, timestamp, and reason.
5. Resolve the physical or configuration cause before attempting any clear, cancel-estop, or reset command.
6. Use `CLEAR_FP_ERROR` only when the reported error is understood and the dispenser is safe.
7. Use `CANCEL_FP_ESTOP` only after the emergency condition is removed.
8. Use `RESET_FP` only as the final controlled recovery step; then re-read `FpStatus` before reopening or authorizing the pump.
9. Confirm transaction buffers are not stale or locked by another POS before resuming operation.
10. Escalate repeated, unknown, communication, or hardware faults to a field engineer and retain the support bundle.

## Do not reset when

- A nozzle, motor, encoder, valve, leak detector, or other physical component is still in an alarm state.
- The pump is offline or controller communications are unstable.
- A tank is blocked, in delivery, below operational threshold, or reporting an unresolved alarm.
- A supervised or unsupervised transaction remains locked or partially processed.
- The active price/grade configuration is inconsistent with the site configuration.
- The source of the emergency stop is unknown.

## Evidence to retain

Capture the raw DOMS response, normalized pump state, error guidance, operator identity, requested command, command result, transaction-buffer snapshot, linked tank state, and post-recovery status. Include these in the DOMS support bundle for recurrent faults.
