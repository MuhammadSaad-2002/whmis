-- Existing installation: back up and select the Tradentra database in phpMyAdmin.
-- Import before deploying the application if you are applying the migration manually.
-- Existing and newly created products are visible to Bookers by default.
-- Safe to re-import: existing visibility choices are not changed.
SET @tradentra_booker_visibility_ddl = IF(
    EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'products'
          AND COLUMN_NAME = 'visible_to_bookers'
    ),
    'SELECT 1',
    'ALTER TABLE `products` ADD COLUMN `visible_to_bookers` TINYINT(1) NOT NULL DEFAULT 1'
);
PREPARE tradentra_booker_visibility FROM @tradentra_booker_visibility_ddl;
EXECUTE tradentra_booker_visibility;
DEALLOCATE PREPARE tradentra_booker_visibility;

-- Record the matching Laravel migration so a later cPanel deploy can skip it.
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_11_23_000100_add_booker_visibility_to_products', COALESCE(MAX(`batch`), 0) + 1
FROM `migrations`
HAVING EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'visible_to_bookers'
) AND NOT EXISTS (
    SELECT 1 FROM `migrations` WHERE `migration` = '2026_11_23_000100_add_booker_visibility_to_products'
);
