-- Optional data repair, not a schema migration. Back up first and import only
-- after confirming these are the affected drafts in this database.
-- Restores the originally audited November/August invoice dates, and the
-- first saved due date of SI-2026-0029. Never adjusts posted/cancelled invoices,
-- invoice lines, stock, payments, dispatches, or the ledger.
-- The document numbers, linked bookings and exact old dates make reruns safe.

START TRANSACTION;

UPDATE sales_invoices AS s
INNER JOIN bookings AS b ON b.id = s.booking_id AND b.customer_id = s.customer_id
INNER JOIN (
    SELECT 'SI-2026-0015' AS invoice_number, 'BK-2026-0009' AS booking_number,
           '2026-08-25' AS old_invoice_date, '2026-08-27' AS corrected_invoice_date,
           CAST(NULL AS DATE) AS old_due_date, CAST(NULL AS DATE) AS corrected_due_date
    UNION ALL SELECT 'SI-2026-0029', 'BK-2026-0015', '2026-11-21', '2026-11-23', '2026-11-22', '2026-11-23'
    UNION ALL SELECT 'SI-2026-0030', 'BK-2026-0014', '2026-11-21', '2026-11-23', NULL, NULL
    UNION ALL SELECT 'SI-2026-0031', 'BK-2026-0013', '2026-11-21', '2026-11-23', NULL, NULL
    UNION ALL SELECT 'SI-2026-0032', 'BK-2026-0012', '2026-11-22', '2026-11-23', NULL, NULL
    UNION ALL SELECT 'SI-2026-0033', 'BK-2026-0011', '2026-11-22', '2026-11-23', NULL, NULL
) AS fix ON fix.invoice_number = s.invoice_number AND fix.booking_number = b.booking_number
SET s.invoice_date = fix.corrected_invoice_date,
    s.due_date = fix.corrected_due_date,
    s.updated_at = UTC_TIMESTAMP()
WHERE s.status = 'draft'
  AND s.posted_at IS NULL
  AND s.sale_type = 'booking'
  AND b.booking_date = fix.corrected_invoice_date
  AND s.invoice_date = fix.old_invoice_date
  AND s.due_date <=> fix.old_due_date;

SELECT ROW_COUNT() AS corrected_drafts;

COMMIT;
