-- Optional phpMyAdmin alternative to the Laravel migration. Select the Tradentra database first.
-- Safe to re-import. Existing invoice amounts, remarks and reference values are not changed.
SET @tradentra_mp_ref_ddl = IF(
    EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sales_invoices'
          AND COLUMN_NAME = 'mp_inv_ref'
    ),
    'SELECT 1',
    'ALTER TABLE `sales_invoices` ADD COLUMN `mp_inv_ref` VARCHAR(64) NULL'
);
PREPARE tradentra_mp_ref FROM @tradentra_mp_ref_ddl;
EXECUTE tradentra_mp_ref;
DEALLOCATE PREPARE tradentra_mp_ref;

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_11_25_000100_add_mp_inv_ref_to_sales_invoices', COALESCE(MAX(`batch`), 0) + 1
FROM `migrations`
HAVING NOT EXISTS (
    SELECT 1 FROM `migrations` WHERE `migration` = '2026_11_25_000100_add_mp_inv_ref_to_sales_invoices'
);
