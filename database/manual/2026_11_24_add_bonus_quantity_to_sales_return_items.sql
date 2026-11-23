-- Select the production database in phpMyAdmin and back it up before importing.
-- quantity remains total physical units returned; bonus_quantity is the free portion.
-- Existing returns were billed-only and keep their quantities, costs and credits.
SET @tradentra_bonus_return_ddl = IF(
    EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_return_items'
          AND COLUMN_NAME = 'bonus_quantity'
    ),
    'SELECT 1',
    'ALTER TABLE `sales_return_items` ADD COLUMN `bonus_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0'
);
PREPARE tradentra_bonus_return FROM @tradentra_bonus_return_ddl;
EXECUTE tradentra_bonus_return;
DEALLOCATE PREPARE tradentra_bonus_return;

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_11_24_000100_add_bonus_quantity_to_sales_return_items', COALESCE(MAX(`batch`), 0) + 1
FROM `migrations`
HAVING NOT EXISTS (
    SELECT 1 FROM `migrations` WHERE `migration` = '2026_11_24_000100_add_bonus_quantity_to_sales_return_items'
);
