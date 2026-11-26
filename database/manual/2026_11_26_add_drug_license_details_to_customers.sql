-- Optional phpMyAdmin alternative to the Laravel migration. Select the Tradentra database first.
-- Safe to re-import. Existing drug licence numbers and customer records are not changed.
SET @tradentra_license_date_ddl = IF(
    EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'drug_license_expires_on'
    ),
    'SELECT 1',
    'ALTER TABLE `customers` ADD COLUMN `drug_license_expires_on` DATE NULL'
);
PREPARE tradentra_license_date FROM @tradentra_license_date_ddl;
EXECUTE tradentra_license_date;
DEALLOCATE PREPARE tradentra_license_date;

SET @tradentra_license_path_ddl = IF(
    EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'drug_license_path'
    ),
    'SELECT 1',
    'ALTER TABLE `customers` ADD COLUMN `drug_license_path` VARCHAR(255) NULL'
);
PREPARE tradentra_license_path FROM @tradentra_license_path_ddl;
EXECUTE tradentra_license_path;
DEALLOCATE PREPARE tradentra_license_path;

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_11_26_000100_add_drug_license_details_to_customers', COALESCE(MAX(`batch`), 0) + 1
FROM `migrations`
HAVING NOT EXISTS (
    SELECT 1 FROM `migrations` WHERE `migration` = '2026_11_26_000100_add_drug_license_details_to_customers'
);
