# DOMS JPL TLS and mutual TLS configuration

The runtime now supports secure JPL connections on port `8889`, including an optional private CA and client certificate pair for deployments that require mutual TLS.

## Environment and station KV settings

| Setting                       | Purpose                                                         | Default            |
| ----------------------------- | --------------------------------------------------------------- | ------------------ |
| `JPL_TLS_REQUIRED`            | Enables TLS even when a non-standard secure port is used.       | `false`            |
| `JPL_TLS_REJECT_UNAUTHORIZED` | Verifies the PSS certificate chain. Keep enabled in production. | `true`             |
| `JPL_TLS_SERVERNAME`          | TLS SNI name and certificate hostname to verify.                | unset              |
| `JPL_TLS_CA_PATH`             | Path to a PEM CA bundle used to verify the PSS certificate.     | system trust store |
| `JPL_TLS_CLIENT_CERT_PATH`    | Path to the PEM client certificate chain.                       | unset              |
| `JPL_TLS_CLIENT_KEY_PATH`     | Path to the matching PEM private key.                           | unset              |
| `JPL_TLS_MIN_VERSION`         | Minimum protocol version: `TLSv1.2` or `TLSv1.3`.               | `TLSv1.2`          |

The same values can be stored in station KV under their `env:` keys. File contents are loaded only when the JPL bootstrap configuration is built; PEM data is never returned by the integration health endpoint.

## Mutual TLS rules

`JPL_TLS_CLIENT_CERT_PATH` and `JPL_TLS_CLIENT_KEY_PATH` are an atomic pair. Startup fails before opening a socket when only one is configured. This avoids silently falling back to server-only TLS when the site expects client authentication.

Recommended production configuration:

```env
JPL_TCP_PORT=8889
JPL_TLS_REQUIRED=true
JPL_TLS_REJECT_UNAUTHORIZED=true
JPL_TLS_SERVERNAME=pss.site.example
JPL_TLS_CA_PATH=/opt/fccapps/vpos-perm/certs/doms-ca.pem
JPL_TLS_CLIENT_CERT_PATH=/opt/fccapps/vpos-perm/certs/vpos-client.pem
JPL_TLS_CLIENT_KEY_PATH=/opt/fccapps/vpos-perm/certs/vpos-client-key.pem
JPL_TLS_MIN_VERSION=TLSv1.2
```

Protect the private key using operating-system permissions and mount it read-only for the application user. Do not store PEM content directly in the database, logs, support bundles, or configuration APIs.

## Commissioning checks

1. Confirm the PSS secure JPL service is enabled on port `8889`.
2. Verify the CA chain and hostname before enabling production traffic.
3. Confirm both client certificate and key are readable by the service account.
4. Run the read-only live validator over TLS before enabling operational workflows.
5. Rotate certificates using an atomic file replacement, then restart or reload the forecourt runtime.
