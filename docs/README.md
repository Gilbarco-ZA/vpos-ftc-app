# Documentation

This directory separates current guidance from historical evidence.

## Authoritative

- [Architecture](ARCHITECTURE.md)
- [Development](development.md)
- [Testing](testing.md)
- [Configuration](configuration.md)
- [Startup flow](startup-flow.md)

## Manuals

- [Technician Setup Guide](manuals/TECHNICIAN_SETUP_GUIDE.md)
- [Management Guide](manuals/MANAGEMENT_GUIDE.md)
- [Manager Training Guide](manuals/MANAGER_TRAINING_GUIDE.md) — on-site training exercises, screenshot placeholders, and competency sign-off for station managers/supervisors
- [API Guide for Third-Party Developers](manuals/API_GUIDE.md)
- [Installed-Package API Wire Contract Reference](manuals/API_WIRE_CONTRACTS.md) — concrete request/response DTOs, envelopes, enums, aliases, pagination, content types, and compatibility boundaries for developers who do not have source access

## Domains

- [Forecourt and DOMS/JPL](domains/forecourt.md)
- [Transactions and fiscalization](domains/transactions.md)
- [Tanzania fiscalization](domains/tanzania-fiscalization.md)
- [Runtime and workers](domains/runtime-workers.md)
- [Product stock](domains/product-stock.md)

## Runbooks

- [Production installation and upgrade](runbooks/production-installation.md) — field installation, startup validation, acceptance, restart check, and rollback triggers
- [Commissioning](runbooks/commissioning.md) — production release/site go-no-go checklist and handover evidence
- [Production debugging](runbooks/production-debugging.md) — on-site triage, safe diagnostics, decision tree, and escalation package
- [Production support screenshot guide](runbooks/support-screenshot-guide.md) — screenshot placeholders and capture/redaction requirements for field support documentation
- [Forecourt recovery](runbooks/forecourt-recovery.md)
- [Storage retirement](runbooks/storage-retirement.md)
- [Secure artifacts](runbooks/secure-artifacts.md)
- [Tanzania cutover](runbooks/tanzania-cutover.md)

## Screenshot assets

- [Documentation Screenshot Assets](images/README.md) — approved folder convention, filenames, redaction rules, and placeholder replacement instructions for support and manager screenshots

## Production handover set

For a release to a live site, the minimum documentation set is:

1. [Production installation and upgrade](runbooks/production-installation.md)
2. [Commissioning](runbooks/commissioning.md)
3. [Production debugging](runbooks/production-debugging.md)
4. [Technician Setup Guide](manuals/TECHNICIAN_SETUP_GUIDE.md)
5. [Management Guide](manuals/MANAGEMENT_GUIDE.md)
6. [Manager Training Guide](manuals/MANAGER_TRAINING_GUIDE.md)
7. [Production support screenshot guide](runbooks/support-screenshot-guide.md)

The deployment ticket/change record should hold the site-specific package version, rollback reference, test evidence, approvals, and sign-off. Do not put production secrets or raw customer data in repository documentation.

## Architectural decisions

- [ADR 0001: Modular monolith](adr/0001-modular-monolith.md)
- [ADR 0002: Configuration ownership](adr/0002-configuration-ownership.md)

## Archive

`archive/` contains superseded implementation notes, validation evidence, historical TODOs, and previous documentation snapshots. Archived files are not agent guidance and may describe behavior that no longer exists.

## Documentation policy

Update an existing authoritative document rather than creating a new pass-specific note. Operator procedures belong in runbooks. Durable architectural choices belong in ADRs. Generated evidence should be stored outside the repository; retain only a digest or external reference when required.
