-- vpos-proxy accepts Tanzania TRA tax codes A-E. TaxCode Z must not be
-- selectable because the cloud fiscalization contract rejects it.

UPDATE country_dataset_rows
   SET is_active = FALSE,
       updated_at = NOW()
 WHERE country_code = 'TZ'
   AND dataset_type = 'taxTypes'
   AND UPPER(code) = 'Z';
