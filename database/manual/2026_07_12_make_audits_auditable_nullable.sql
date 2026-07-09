-- Manual SQL for the Laravel migration:
--   2026_07_12_000200_make_audits_auditable_nullable
--
-- Use this ONLY if you apply schema changes by importing SQL in phpMyAdmin
-- instead of running `php artisan migrate`. Import this file ONCE.
--
-- Makes audits.auditable_type / auditable_id nullable so system/auth events
-- (e.g. a failed login for an unknown email) can be recorded with no model.
-- Safe: relaxes NOT NULL only; existing rows are unaffected and the index stays.

ALTER TABLE `audits`
    MODIFY `auditable_type` VARCHAR(255) NULL,
    MODIFY `auditable_id` BIGINT UNSIGNED NULL;

-- Record the migration as applied so `php artisan migrate` won't re-run it.
INSERT INTO `migrations` (`migration`, `batch`)
VALUES (
    '2026_07_12_000200_make_audits_auditable_nullable',
    (SELECT b FROM (SELECT COALESCE(MAX(`batch`), 0) + 1 AS b FROM `migrations`) AS t)
);
