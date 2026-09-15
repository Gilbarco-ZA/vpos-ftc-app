# Documentation

This directory separates current guidance from historical evidence.

## Authoritative

- [Architecture](ARCHITECTURE.md)
- [Development](development.md)
- [Testing](testing.md)
- [Configuration](configuration.md)
- [Startup flow](startup-flow.md)

## Production field manuals

The production rollout uses two primary manuals:

1. [VPOS FTC Field Support, Installation & Commissioning Manual](manuals/TECHNICIAN_SETUP_GUIDE.md) — package installation on DOMS, in-app configuration, commissioning, troubleshooting, screenshots, acceptance, and handover.
2. [VPOS FTC Manager Operations & Training Manual](manuals/MANAGEMENT_GUIDE.md) — daily operation, manager configuration boundaries, screenshots, training exercises, escalation, and competency sign-off.

The field manuals assume the production application is delivered as one of the approved Node.js 22 DOMS packages:

- CPB-579: `cpb-579-node22.pkg`
- CPB-539: `cpb-539-node-22.pkg`

Production field support does not require or permit SSH, terminal/shell access, source checkout, npm commands, SQL commands, filesystem edits, or production `.env` editing. Site-specific adjustments are made through supported VPOS application screens and approved DOMS/PSS administration tools.

## Developer/API manuals

- [API Guide for Third-Party Developers](manuals/API_GUIDE.md)
- [Installed-Package API Wire Contract Reference](manuals/API_WIRE_CONTRACTS.md)

## Domains

- [Forecourt and DOMS/JPL](domains/forecourt.md)
- [Transactions and fiscalization](domains/transactions.md)
- [Tanzania fiscalization](domains/tanzania-fiscalization.md)
- [Runtime and workers](domains/runtime-workers.md)
- [Product stock](domains/product-stock.md)

## Runbooks

The production runbook entry points below intentionally redirect field staff to the consolidated support manual so procedures are not duplicated or allowed to drift:

- [Production installation and upgrade](runbooks/production-installation.md)
- [Commissioning](runbooks/commissioning.md)
- [Production debugging](runbooks/production-debugging.md)
- [Forecourt recovery](runbooks/forecourt-recovery.md)
- [Storage retirement](runbooks/storage-retirement.md)
- [Secure artifacts](runbooks/secure-artifacts.md)
- [Tanzania cutover](runbooks/tanzania-cutover.md)

## Screenshot assets

- [Documentation Screenshot Assets](images/README.md) — approved folder convention, filenames, and redaction rules for support and manager screenshots.

## Production handover set

For release to a live site, provide:

1. [Field Support, Installation & Commissioning Manual](manuals/TECHNICIAN_SETUP_GUIDE.md)
2. [Manager Operations & Training Manual](manuals/MANAGEMENT_GUIDE.md)

The deployment/change record should hold the site-specific package version, rollback reference, acceptance evidence, approvals, and sign-off. Do not put production secrets or raw customer data in repository documentation.

## Architectural decisions

- [ADR 0001: Modular monolith](adr/0001-modular-monolith.md)
- [ADR 0002: Configuration ownership](adr/0002-configuration-ownership.md)

## Archive

`archive/` contains superseded implementation notes, validation evidence, historical TODOs, and previous documentation snapshots. Archived files are not field guidance and may describe behavior that no longer exists.

## Documentation policy

Update the applicable authoritative document rather than creating a new pass-specific note. Production field procedures belong in the consolidated field-support manual. Manager operating/training procedures belong in the consolidated manager manual. Durable architectural choices belong in ADRs.
