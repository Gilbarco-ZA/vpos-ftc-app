# Secure Artifacts

**Type:** runbook

- Store private keys, certificates, signing material, and credentials outside the repository and public web root.
- Use deployment-managed paths and least-privilege filesystem permissions.
- Validate file existence and permissions before enabling the integration.
- Never include private material in support bundles, logs, screenshots, fixtures, or generated evidence.
- Rotate exposed or uncertain keys and remove them from Git history where feasible.
- Record only non-secret identifiers, fingerprints, validity dates, and external secret-store references.
