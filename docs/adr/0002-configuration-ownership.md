# ADR 0002: Configuration Ownership

**Status:** accepted

Typed configuration is stored in purpose-specific PostgreSQL tables. Station KV is reserved for bounded setup, integration, compatibility, and operational state. Explicit process environment values override approved persisted environment fallbacks, which override code defaults.

Filesystem inputs and bundled country data are compatibility or seed sources, not mutable canonical stores. Destructive retirement requires audit, approval, backup, rollback, and post-verification.
