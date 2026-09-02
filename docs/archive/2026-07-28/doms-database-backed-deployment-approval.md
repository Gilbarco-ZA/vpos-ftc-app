# DOMS database-backed deployment approval

## Purpose

A field engineer can no longer obtain a PSS write execution permit by posting
client-supplied checkpoint names. The permit service now derives release
readiness on the server and requires a persisted, approved deployment sign-off
for the current acceptance definition and physical PSS target.

## Persistence

Migration `1253_doms_deployment_sign_offs.sql` adds
`forecourt_doms_deployment_sign_offs`. Each administrator decision records:

- station and acceptance digest;
- deployment artifact;
- physical PSS target fingerprint;
- approved or rejected decision;
- exceptions;
- signing user and timestamp;
- readiness status and blocker count at signing time.

Rejected decisions remain useful audit evidence but can never satisfy the
execution-permit gate.

## Permit issuance

`POST /api/admin/forecourt/maintenance/execution-permit` now:

1. recalculates current field-validation readiness;
2. rebuilds the current first-site acceptance digest;
3. requires zero production blockers and `ready-for-final-review`;
4. queries the database for the latest approved sign-off matching station,
   acceptance digest, and PSS fingerprint;
5. binds the sign-off ID, acceptance digest, and deployment artifact into a
   version 2 signed permit.

The browser cannot substitute a checkpoint array or claim that deployment
sign-off exists. A stale sign-off stops matching as soon as the acceptance
definition changes.

## Execution verification

The command execution adapter accepts only version 2 permits and verifies the
sign-off ID and acceptance digest as part of the HMAC payload. This prevents
those fields from being changed between permit issuance and command execution.

## Deployment

Apply migration `1253_doms_deployment_sign_offs.sql` before recording a new
sign-off or requesting an execution permit. Existing audit-only sign-offs are
not automatically promoted; record a fresh decision after migration.
