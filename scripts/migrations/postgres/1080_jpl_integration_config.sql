-- Canonicalize legacy DOMS/DOMS_TCP integration config into integrations.jpl.
-- Safe to run multiple times.

-- 1) Seed or merge integrations.jpl from any legacy integration block.
-- Existing integrations.jpl values take precedence over legacy values.
UPDATE station_config
SET config_json = jsonb_set(
  config_json,
  '{integrations,jpl}',
  COALESCE(config_json #> '{integrations,domsTcp}', '{}'::jsonb)
  || COALESCE(config_json #> '{integrations,doms_tcp}', '{}'::jsonb)
  || COALESCE(config_json #> '{integrations,DOMS_TCP}', '{}'::jsonb)
  || COALESCE(config_json #> '{integrations,jpl}', '{}'::jsonb),
  true
)
WHERE config_json #> '{integrations,domsTcp}' IS NOT NULL
   OR config_json #> '{integrations,doms_tcp}' IS NOT NULL
   OR config_json #> '{integrations,DOMS_TCP}' IS NOT NULL;

-- 2) Deep-merge nested portOverrides so existing JPL values still win but
-- missing APC ports can be inherited from legacy blocks.
UPDATE station_config
SET config_json = jsonb_set(
  config_json,
  '{integrations,jpl,portOverrides}',
  COALESCE(config_json #> '{integrations,domsTcp,portOverrides}', '{}'::jsonb)
  || COALESCE(config_json #> '{integrations,doms_tcp,portOverrides}', '{}'::jsonb)
  || COALESCE(config_json #> '{integrations,DOMS_TCP,portOverrides}', '{}'::jsonb)
  || COALESCE(config_json #> '{integrations,jpl,portOverrides}', '{}'::jsonb),
  true
)
WHERE config_json #> '{integrations,jpl}' IS NOT NULL
  AND (
    config_json #> '{integrations,domsTcp,portOverrides}' IS NOT NULL
    OR config_json #> '{integrations,doms_tcp,portOverrides}' IS NOT NULL
    OR config_json #> '{integrations,DOMS_TCP,portOverrides}' IS NOT NULL
    OR config_json #> '{integrations,jpl,portOverrides}' IS NOT NULL
  );

-- 3) Canonicalize legacy field names that may still be present inside
-- integrations.jpl from earlier manual edits or interim builds.
UPDATE station_config
SET config_json = jsonb_set(
  config_json,
  '{integrations,jpl,host}',
  to_jsonb(config_json #>> '{integrations,jpl,jplHost}'),
  true
)
WHERE config_json #> '{integrations,jpl}' IS NOT NULL
  AND config_json #> '{integrations,jpl,host}' IS NULL
  AND NULLIF(BTRIM(config_json #>> '{integrations,jpl,jplHost}'), '') IS NOT NULL;

UPDATE station_config
SET config_json = jsonb_set(
  config_json,
  '{integrations,jpl,accessCode}',
  to_jsonb(config_json #>> '{integrations,jpl,jplAccessCode}'),
  true
)
WHERE config_json #> '{integrations,jpl}' IS NOT NULL
  AND config_json #> '{integrations,jpl,accessCode}' IS NULL
  AND NULLIF(BTRIM(config_json #>> '{integrations,jpl,jplAccessCode}'), '') IS NOT NULL;

UPDATE station_config
SET config_json = jsonb_set(
  config_json,
  '{integrations,jpl,countryCode}',
  to_jsonb(config_json #>> '{integrations,jpl,jplCountryCode}'),
  true
)
WHERE config_json #> '{integrations,jpl}' IS NOT NULL
  AND config_json #> '{integrations,jpl,countryCode}' IS NULL
  AND NULLIF(BTRIM(config_json #>> '{integrations,jpl,jplCountryCode}'), '') IS NOT NULL;

UPDATE station_config
SET config_json = jsonb_set(
  config_json,
  '{integrations,jpl,posId}',
  to_jsonb((config_json #>> '{integrations,jpl,jplPosId}')::int),
  true
)
WHERE config_json #> '{integrations,jpl}' IS NOT NULL
  AND config_json #> '{integrations,jpl,posId}' IS NULL
  AND COALESCE(config_json #>> '{integrations,jpl,jplPosId}', '') ~ '^[0-9]+$';

UPDATE station_config
SET config_json = jsonb_set(
  config_json,
  '{integrations,jpl,portOverrides,apc1}',
  to_jsonb((config_json #>> '{integrations,jpl,jplPort}')::int),
  true
)
WHERE config_json #> '{integrations,jpl}' IS NOT NULL
  AND config_json #> '{integrations,jpl,portOverrides,apc1}' IS NULL
  AND COALESCE(config_json #>> '{integrations,jpl,jplPort}', '') ~ '^[0-9]+$';

-- 4) Remove legacy integration keys now that integrations.jpl exists.
UPDATE station_config
SET config_json = config_json
  #- '{integrations,domsTcp}'
  #- '{integrations,doms_tcp}'
  #- '{integrations,DOMS_TCP}'
WHERE config_json #> '{integrations,domsTcp}' IS NOT NULL
   OR config_json #> '{integrations,doms_tcp}' IS NOT NULL
   OR config_json #> '{integrations,DOMS_TCP}' IS NOT NULL;

-- 5) Remove legacy nested field names from integrations.jpl after the
-- canonical JPL keys have been populated.
UPDATE station_config
SET config_json = config_json
  #- '{integrations,jpl,jplHost}'
  #- '{integrations,jpl,jplPort}'
  #- '{integrations,jpl,jplPosId}'
  #- '{integrations,jpl,jplAccessCode}'
  #- '{integrations,jpl,jplCountryCode}'
WHERE config_json #> '{integrations,jpl}' IS NOT NULL;

-- 6) Normalize the selected POS backend to the canonical jpl value.
UPDATE station_config
SET config_json = jsonb_set(
  config_json,
  '{integrations,posBackend}',
  to_jsonb('jpl'::text),
  true
)
WHERE lower(COALESCE(config_json #>> '{integrations,posBackend}', '')) IN (
  'doms',
  'domstcp',
  'doms-tcp',
  'doms_tcp',
  'doms_direct'
);
