-- Run once in production before deploying the booking timestamp code.
-- Alternative to the matching Laravel migration: do not execute both.
-- Back up first. Unknown historical event times intentionally remain NULL.
ALTER TABLE `bookings`
    ADD COLUMN `last_edited_at` TIMESTAMP NULL DEFAULT NULL,
    ADD COLUMN `submitted_at` TIMESTAMP NULL DEFAULT NULL,
    ADD COLUMN `rejected_at` TIMESTAMP NULL DEFAULT NULL,
    ADD COLUMN `converted_at` TIMESTAMP NULL DEFAULT NULL,
    ADD COLUMN `cancelled_at` TIMESTAMP NULL DEFAULT NULL;

UPDATE `bookings` SET `rejected_at` = `approved_at` WHERE `status` = 'rejected';

-- Register only after all statements above succeed, so later migrations skip it.
INSERT INTO migrations (migration, batch)
SELECT '2026_11_01_000100_add_booking_lifecycle_timestamps', COALESCE(MAX(batch), 0) + 1 FROM migrations
HAVING NOT EXISTS (SELECT 1 FROM migrations WHERE migration = '2026_11_01_000100_add_booking_lifecycle_timestamps');
