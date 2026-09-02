# DOMS maintenance final confirmation gate

This pass adds the last human confirmation boundary required before any future DOMS/PSS maintenance write can be enabled.

## API

`POST /api/admin/forecourt/maintenance/final-confirmation`

The route accepts only the dedicated `field_engineer` role. It requires:

- an approved maintenance session identifier;
- the exact command name;
- the SHA-256 digest of the reviewed command;
- the matching digest produced by the dry-run comparison;
- confirmation of the physical target and PSS Configurator review;
- confirmation that the operator intends an immediate send;
- explicit acknowledgement that execution is still disabled.

A digest mismatch is treated as command drift and the confirmation is rejected.

## Safety boundary

The endpoint records an audit event and a short-lived confirmation token only. It does not call the DOMS gateway, does not enqueue a forecourt command, and cannot enable PSS writes. The confirmation expires after 60 seconds so a later execution implementation cannot reuse stale operator intent.

## Role migration

Migration `1251_field_engineer_role.sql` adds `field_engineer` to the users role constraint for PostgreSQL and Azure SQL.
