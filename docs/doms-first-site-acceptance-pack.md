# DOMS first-site acceptance pack

The first-site acceptance export converts the current field-validation release gate into a versioned, site-specific acceptance contract.

## Endpoint

`GET /api/admin/forecourt/field-validation/acceptance-pack`

Administrator access is required. The endpoint downloads a JSON document containing:

- every production-blocking or manually validated checkpoint;
- the acceptance condition and required evidence for each checkpoint;
- the responsible discipline for each criterion;
- the current readiness summary;
- a SHA-256 digest of the canonical acceptance definition;
- a deployment sign-off template bound to that digest.

## Digest behavior

The digest excludes generation timestamps and current checkpoint results. It represents the acceptance definition itself. Two exports with the same station and criteria therefore have the same digest. Any change to the station, criterion wording, evidence requirements, ownership, approvals, or go-live rule changes the digest.

Final deployment sign-off must reference the digest from the reviewed pack. This prevents an approval prepared against one set of acceptance conditions from being reused after the criteria change.

## Go-live rule

All criteria marked `blocksGoLive` must have a passed source checkpoint with site-specific evidence. Field engineering, support, software, and deployment owners must complete the sign-off template and identify the release artifact and physical PSS target.

The export is evidence and approval support only. It does not enable PSS write execution, transmit a DOMS command, or switch Tanzania fiscalization routing.
