# Configuration History and PSS Storage

This document defines the Phase 5C ownership and retention contract for configuration versions and PSS XML imports.

## Configuration version ownership

Current configuration remains in the purpose-specific current-state tables:

| Configuration class   | Current owner    | Version-history owner     | Retention partition              |
| --------------------- | ---------------- | ------------------------- | -------------------------------- |
| Station configuration | `station_config` | `station_config_versions` | station                          |
| Plugin configuration  | `plugin_configs` | `plugin_config_versions`  | station, process type, plugin    |
| Device configuration  | `device_configs` | `device_config_versions`  | station, device type, device key |

Version rows are rollback evidence, not a second current configuration store. Writers normalize JSON recursively, omit undefined object properties, order object keys, and calculate a SHA-256 `config_hash`. A writer must not append a new version when the latest equivalent normalized configuration already exists.

## Pinning rollback versions

Pinned rows are never selected by configuration-history retention. Pin only versions that are required for an identified deployment or rollback event, and record a meaningful reason.

```bash
npm run config:versions:pin -- --store station --id <version-uuid> --reason "Release 2026.07 rollback"
npm run config:versions:pin -- --store plugin --id <version-id> --reason "DOMS plugin rollback"
npm run config:versions:pin -- --store device --id <version-id> --reason "Printer configuration rollback"

npm run config:versions:pin -- --store station --id <version-uuid> --unpin
```

Valid stores are `station`, `plugin`, and `device`. The command changes only pin metadata; it does not restore or activate the selected configuration.

## Configuration-history retention

Configuration history is handled by the existing station-scoped retention coordinator. It is disabled and dry-run by default.

```env
VPOS_RETENTION_ENABLED=false
VPOS_RETENTION_DRY_RUN=true
VPOS_RETENTION_CONFIG_VERSION_LIMIT=20
VPOS_RETENTION_CONFIG_VERSION_MIN_AGE_DAYS=7
```

For each owner partition, retention:

1. ranks versions newest first;
2. always keeps the latest configured count;
3. excludes pinned versions;
4. excludes excess versions younger than the minimum age;
5. selects and deletes rows in bounded `SKIP LOCKED` batches.

The default result is the latest 20 versions plus any older pinned versions. The migration does not prune existing history. Operators must first review a dry-run retention result in the target database.

## PSS XML ownership

A PSS import has four durable representations with distinct roles:

| Data                    | Owner                                                 | Purpose                                                                               |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Raw XML                 | `station_kv['pss.xml.raw']`                           | Authoritative import/export source while XML export is supported                      |
| ID map                  | `station_kv['pss.xml.idMap']`                         | Maps normalized database IDs back to PSS identifiers                                  |
| Normalized runtime data | product, tank, pump, nozzle, and configuration owners | Queryable application state                                                           |
| Import summary          | `station_kv['pss.xml.importSummary']`                 | Compact checksum, source, timestamp, byte count, parsed counts, and normalized counts |

`station_kv['pss.xml.parsed']` is a deprecated compatibility copy. New imports parse XML in memory but do not persist the parsed object. Admin status reads use the compact summary and derive a temporary summary from a legacy parsed row only when no stored summary exists.

## Legacy parsed-copy retirement

Migration `1265_pss_summary_config_version_retention.sql` backfills a versioned compact summary where a legacy parsed row exists. It deliberately does not remove the parsed row.

The retention target may delete `pss.xml.parsed` only when the same station has:

- a compact `pss.xml.importSummary`;
- authoritative `pss.xml.raw` XML;
- a `pss.xml.idMap`;
- an elapsed compatibility window measured from summary creation/update.

```env
VPOS_RETENTION_PSS_PARSED_COMPATIBILITY_DAYS=30
```

The target removes only the deprecated KV row. It does not remove raw XML, the ID map, normalized data, checksums, or import history.

## Migration and rollout sequence

1. Apply migration `1265_pss_summary_config_version_retention.sql`.
2. Deploy application writers that stop creating `pss.xml.parsed` and suppress duplicate version rows.
3. Pin deployment/rollback versions that must survive retention.
4. Keep retention in dry-run mode and inspect all four Phase 5C targets:
   - `station_config_versions`;
   - `plugin_config_versions`;
   - `device_config_versions`;
   - `pss_xml_parsed_duplicate`.
5. Verify PSS raw XML export and ID mapping on a production-like copy.
6. Enable deletion only after the compatibility window and rollback review are complete.
7. Regenerate `vpos-server.cjs` through the authenticated production build; committed/generated bundles must not be treated as source authority.

## Rollback boundary

- Disabling retention stops all Phase 5C deletion immediately.
- Pinned version rows remain protected independently of the configured version limit.
- Existing parsed PSS rows remain readable until retention removes them.
- Reverting to an older application after parsed-copy deletion is unsupported if that binary requires `pss.xml.parsed`; retain raw XML, ID map, backups, and the compatible release until the soak is complete.
- No production deletion or pruning is performed by the migration itself.
