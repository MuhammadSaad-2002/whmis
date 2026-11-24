-- One-time historical delivery status backfill. Back up the database first.
-- Targets posted SI-2026-0001 through SI-2026-0028 only.
-- Keeps existing assignments and logs. Does not close actual custody, deliveries,
-- or collection activity. SI-2026-0029 onward, drafts and cancellations are untouched.
-- The new timestamp records the administrative status change, not the date of delivery.
-- No pickup items, receipts, stock, ledger, or commissions are written.

SET @legacy_delivery_ddl = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'dispatches' AND COLUMN_NAME = 'historical_delivered_at'),
    'SELECT 1',
    'ALTER TABLE `dispatches` ADD COLUMN `historical_delivered_at` TIMESTAMP NULL DEFAULT NULL'
);
PREPARE legacy_delivery_ddl FROM @legacy_delivery_ddl;
EXECUTE legacy_delivery_ddl;
DEALLOCATE PREPARE legacy_delivery_ddl;

START TRANSACTION;

UPDATE `dispatches` AS dispatch
JOIN `sales_invoices` AS invoice ON invoice.id = dispatch.sales_invoice_id
SET dispatch.status = 'delivered', dispatch.historical_delivered_at = CURRENT_TIMESTAMP
WHERE invoice.status = 'posted'
  AND invoice.invoice_number REGEXP '^SI-2026-00(0[1-9]|1[0-9]|2[0-8])$'
  AND dispatch.status IN ('pending', 'picking')
  AND dispatch.custody_required = 0
  AND dispatch.custodian_id IS NULL AND dispatch.handover_to_id IS NULL AND dispatch.pickup_confirmed_at IS NULL
  AND dispatch.historical_delivered_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM `dispatch_events` AS event
                  WHERE event.dispatch_id = dispatch.id AND event.action NOT IN ('assign', 'picking'))
  AND NOT EXISTS (SELECT 1 FROM `delivery_collections` AS collection WHERE collection.sales_invoice_id = invoice.id);

SELECT ROW_COUNT() AS existing_dispatches_marked_delivered;

INSERT INTO `dispatches` (`sales_invoice_id`, `status`, `custody_required`, `historical_delivered_at`)
SELECT invoice.id, 'delivered', 0, CURRENT_TIMESTAMP
FROM `sales_invoices` AS invoice
WHERE invoice.status = 'posted'
  AND invoice.invoice_number REGEXP '^SI-2026-00(0[1-9]|1[0-9]|2[0-8])$'
  AND NOT EXISTS (
      SELECT 1 FROM `dispatches` AS dispatch WHERE dispatch.sales_invoice_id = invoice.id
  );

SELECT ROW_COUNT() AS untracked_invoices_marked_delivered;

-- Review any protected records that weren't eligible for this backfill.
SELECT invoice.invoice_number, dispatch.status AS existing_dispatch_status
FROM `sales_invoices` AS invoice
JOIN `dispatches` AS dispatch ON dispatch.sales_invoice_id = invoice.id
WHERE invoice.status = 'posted'
  AND invoice.invoice_number REGEXP '^SI-2026-00(0[1-9]|1[0-9]|2[0-8])$'
  AND dispatch.status <> 'delivered'
ORDER BY invoice.invoice_number;

COMMIT;
