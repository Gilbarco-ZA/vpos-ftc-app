# DOMS maintenance command comparison

The maintenance workflow now provides a deterministic comparison between a reviewed preview envelope and a candidate executable envelope.

`POST /api/admin/forecourt/maintenance/compare` is administrator-only and requires both `confirmComparisonOnly` and `confirmNoDomsCommand` to be `true`.

The comparison:

- validates both objects through the existing outbound JPL schema;
- canonicalizes object-key order without reordering arrays;
- calculates SHA-256 digests for both envelopes;
- returns field-level added, removed, and changed paths;
- never opens a socket or invokes the DOMS client;
- always keeps `executionEnabled`, `sendsDomsCommand`, and `canAdvanceToFinalConfirmation` false.

An exact match is evidence that the candidate has not drifted from the preview. It is not approval to execute. PSS maintenance writes remain hard-disabled until field validation, role policy, final operator confirmation, and a global kill switch are implemented and approved.
