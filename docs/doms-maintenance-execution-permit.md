# DOMS maintenance execution permit foundation

The FTC application now has a deny-by-default, short-lived execution-permit gate for future PSS installation and clear-install commands.

The gate does **not** send a JPL command. It only evaluates prerequisites and, when every control passes, returns a signed permit valid for 30 seconds.

Required controls:

- `field_engineer` role and matching station
- approved, unexpired maintenance session
- unexpired final operator confirmation
- exact command/comparison digest match
- reconciliation evidence no older than five minutes
- field-validation and deployment-sign-off checkpoints
- physical target fingerprint confirmation
- command allowlist
- global feature flag enabled
- global kill switch explicitly disabled
- signing secret of at least 32 characters

Environment controls:

```env
DOMS_PSS_WRITE_EXECUTION_ENABLED=false
DOMS_PSS_WRITE_KILL_SWITCH=true
DOMS_PSS_WRITE_PERMIT_SECRET=
```

Production defaults remain blocked. A later adapter must independently verify and consume the one-time permit before any command transmission.
