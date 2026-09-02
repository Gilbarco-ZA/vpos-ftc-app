# DOMS commissioning readiness

The commissioning readiness workflow is a read-only production gate for the first DOMS/PSS site bring-up and for moving a station from simulator or legacy forecourt mode to JPL-only mode.

It does not send DOMS/PSS commands, update PSS Configurator data, execute maintenance commands, or change FTC mappings. It only validates FTC settings and presents the manual evidence that field engineers and support must collect before a site is accepted.

## API

```text
GET /api/admin/forecourt/commissioning
```

The response includes:

- overall commissioning status
- live JPL setting validation checks
- setting blockers and warnings
- first-site commissioning checklist
- legacy/simulator-to-JPL runbook
- live readiness summary from diagnostics, reconciliation, and validation checkpoints

## Live JPL setting checks

The validator checks the saved station-scoped JPL settings before live connection is considered ready:

- JPL host is present and not accidentally left on localhost for a field site
- JPL port is valid and preferably one of the standard ports, `8888` or `8889`
- TLS-required deployments use the secure JPL port, `8889`
- POS ID is unique and not `00` or reserved/internal IDs above `89`
- `FcAccessCode` contains `POS` and `RI`
- required unsolicited families are enabled:
  - `UNSO_INSTSTA_1`
  - `UNSO_TRBUFSTA_3`
  - `UNSO_TGSTA_1`
  - `UNSO_DELIVSTA_1`
  - `UNSO_PRISTA_1`
- pump MFDR status is enabled through `UNSO_FPSTA_3`
- heartbeat interval is positive and no greater than 15 seconds
- dead-connection timeout is greater than the heartbeat interval and preferably no greater than 30 seconds
- expected JPL version floor is at least `470-02-1.07`
- country code is DEC4-compatible
- POS version identifier is present
- status update code is the expected first-release value, `3`
- bootstrap reconciliation snapshot is enabled
- supervised and unsupervised buffer warning/critical thresholds are ordered correctly

## First-site commissioning checklist

The readiness panel includes a deployment checklist covering:

1. Confirm first-site scope and acceptance criteria.
2. Verify PSS Configurator logical installation.
3. Validate FTC JPL settings.
4. Run JPL connectivity/logon/status tests.
5. Refresh reconciliation and resolve FTC-side mapping issues.
6. Exercise pump, transaction, wetstock, and price workflows.
7. Export the support bundle and field-validation readiness evidence.

## Legacy or simulator to JPL-only runbook

Before switching a station from simulator or legacy mode to JPL-only operation:

1. Freeze legacy/simulator activity.
2. Drain or reconcile pending local queues.
3. Save station-scoped JPL settings.
4. Run the JPL logon and status test.
5. Restart FTC runtime services so long-lived adapters use the saved settings.
6. Monitor the first operating hour for reconnects, rejects, buffer backlog, stale locks, and transaction clear failures.

## Evidence model

The readiness output should be attached to the deployment ticket together with:

- PSS Configurator export or screenshots
- setup JPL test result
- reconciliation export
- mapping history export, if mappings were corrected
- workflow review evidence
- redacted DOMS support bundle
- field validation readiness export

A station should not be treated as field-accepted until blockers are cleared or explicitly signed off by field engineering and support.
