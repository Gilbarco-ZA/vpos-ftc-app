# Documentation

This directory separates current guidance from historical evidence.

## Authoritative

- [Architecture](architecture.md)
- [Development](development.md)
- [Testing](testing.md)
- [Configuration](configuration.md)
- [Startup flow](startup-flow.md)

## Domains

- [Forecourt and DOMS/JPL](domains/forecourt.md)
- [Transactions and fiscalization](domains/transactions.md)
- [Tanzania fiscalization](domains/tanzania-fiscalization.md)
- [Runtime and workers](domains/runtime-workers.md)
- [Product stock](domains/product-stock.md)

## Runbooks

- [Commissioning](runbooks/commissioning.md)
- [Forecourt recovery](runbooks/forecourt-recovery.md)
- [Storage retirement](runbooks/storage-retirement.md)
- [Secure artifacts](runbooks/secure-artifacts.md)
- [Tanzania cutover](runbooks/tanzania-cutover.md)
- [Production debugging](runbooks/production-debugging.md)

## Architectural decisions

- [ADR 0001: Modular monolith](adr/0001-modular-monolith.md)
- [ADR 0002: Configuration ownership](adr/0002-configuration-ownership.md)

## Archive

`archive/` contains superseded implementation notes, validation evidence, historical TODOs, and previous documentation snapshots. Archived files are not agent guidance and may describe behavior that no longer exists.

## Documentation policy

Update an existing authoritative document rather than creating a new pass-specific note. Operator procedures belong in runbooks. Durable architectural choices belong in ADRs. Generated evidence should be stored outside the repository; retain only a digest or external reference when required.
