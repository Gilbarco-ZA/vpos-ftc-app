# DOMS first-site deployment sign-off

The first-site acceptance pack now has a server-side, audit-backed sign-off endpoint:

```text
POST /api/admin/forecourt/field-validation/sign-off
```

The endpoint recalculates the current acceptance pack and refuses stale digests. An approval is accepted only when the release gate reports `ready-for-final-review`, no production-blocking checkpoints remain, the physical PSS target has been confirmed, and all named owners are supplied.

Rejected sign-offs may be recorded with exceptions so failed commissioning attempts remain visible in the audit trail. Approved sign-offs cannot contain unresolved exceptions.

The record is bound to the acceptance digest, deployment artifact, and PSS target fingerprint. Recording a sign-off does not send a JPL command, enable the PSS write gate, change mappings, or switch fiscalization routing.
