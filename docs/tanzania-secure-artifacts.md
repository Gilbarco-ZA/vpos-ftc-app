# Tanzania fiscal secure artifacts

Tanzania local fiscalization must not ship TRA/EWURA certificate assets in the application bundle. Production key material belongs in FTC secure artifacts and station-scoped configuration only.

## Runtime keys

The Tanzania fiscal module resolves signing material in this order:

1. TRA-specific secure artifacts, such as `tra/private-key.pem`, `tra/certificate.pem`, or `tra/certificate.crt`.
2. EWURA-specific secure artifacts, such as `ewura/private-key.pem`, `ewura/certificate.pem`, or `ewura/certificate.crt`.
3. Shared certificate secure artifacts, such as `cert/private-key.pem`, `cert/certificate.pem`, or `cert/certificate.crt`.
4. Station KV compatibility values, used only for imported legacy metadata and developer migration scenarios.

TRA flows use TRA-specific artifacts with shared certificate fallback. EWURA flows use EWURA-specific artifacts with shared certificate fallback.

## Supported runtime format

FTC runtime signing expects PEM-formatted private keys and X.509 public certificates. This deliberately replaces the `vpos-fiscal-tz` package behavior that can read bundled PFX files from package assets.

When a site backup contains PFX files, convert and import the PEM private key and public certificate into secure artifacts during commissioning. Do not commit PFX, PEM, passphrase, or certificate serial files into source control.

## Serial handling

TRA `Cert-Serial` headers use the base64 encoding of the formatted certificate serial number. The formatter normalizes a serial such as `0a01ff` to `0A 01 FF`, then base64 encodes that formatted value.

## Rotation notes

Rotating a secure artifact creates a new encrypted artifact row and marks the old row as rotated. After rotation, verify:

- TRA registration/receipt/z-report signing still succeeds.
- EWURA registration/sales/inventory signing still succeeds.
- The effective certificate serial shown in diagnostics matches the newly imported certificate.
- Any PFX-only artifacts are treated as migration evidence, not runtime signing inputs.
