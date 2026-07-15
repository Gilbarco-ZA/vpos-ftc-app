# DOMS maintenance command execution

This pass adds the final, deliberately narrow adapter that can transmit an approved DOMS/PSS installation command. It remains deny-by-default and is intended only for controlled commissioning windows.

## Safety chain

A command is sent only when all of these controls pass again at execution time:

1. The authenticated user has the `field_engineer` role and matches the permit user and station.
2. `DOMS_PSS_WRITE_EXECUTION_ENABLED=true`.
3. `DOMS_PSS_WRITE_KILL_SWITCH=false`.
4. The permit HMAC is valid and has not expired.
5. The permit target fingerprint exactly matches `DOMS_PSS_TARGET_FINGERPRINT` from trusted server configuration.
6. The submitted envelope name and canonical SHA-256 digest exactly match the permit.
7. The permit signature is atomically claimed in the database. A duplicate claim is rejected before socket access.
8. The message is in the maintenance allowlist.

A claimed permit is never released. A transport failure or PSS reject records the claim as `failed`; an engineer must repeat preview, comparison, confirmation, and permit issuance before retrying.

## Endpoint

`POST /api/admin/forecourt/maintenance/execute`

The body contains the signed permit, the exact reviewed JPL envelope, and two explicit confirmations:

```json
{
  "permit": { "...": "permit returned by execution-permit" },
  "envelope": {
    "name": "clear_InstallData_req",
    "subCode": "01H",
    "data": {
      "ExtendedInstallMsgCode": "76A4H",
      "FcDeviceId": "12"
    }
  },
  "confirmImmediateExecution": true,
  "confirmPermitWillBeConsumed": true
}
```

## Configuration

```env
DOMS_PSS_WRITE_EXECUTION_ENABLED=false
DOMS_PSS_WRITE_KILL_SWITCH=true
DOMS_PSS_WRITE_PERMIT_SECRET=
DOMS_PSS_TARGET_FINGERPRINT=
```

Keep the enable flag false and kill switch true during normal operation. The target fingerprint must be derived and approved during commissioning; it must not be supplied by the browser.

## Database migration

Apply `1252_doms_maintenance_execution_claims.sql` before enabling execution. The table is the cross-process replay barrier and audit state for each one-time permit.

## Supported messages

- `install_Fp_req`
- `install_Tg_req`
- `install_Dispenser_req`
- `install_Pp_req`
- `clear_InstallData_req`

Operational commands and all other installation messages remain outside this adapter.
