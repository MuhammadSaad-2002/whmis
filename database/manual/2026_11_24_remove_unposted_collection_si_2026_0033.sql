-- Optional one-time data repair. Back up the selected database before import.
-- Removes ONLY the unposted Rs 5,000 cash report for SI-2026-0033 and its
-- report/review events. Leaves the Rs 5,723.67 report, collection day, delivery,
-- invoice, stock, ledger and payments intact. No effect on a second import.
-- A zero result means absent or the safety checks failed; do not weaken them.

START TRANSACTION;

SET @cleanup_invoice_id := NULL;
SET @cleanup_collection_id := NULL;

SELECT i.id INTO @cleanup_invoice_id
FROM sales_invoices AS i
INNER JOIN customers AS customer ON customer.id = i.customer_id
WHERE i.invoice_number = 'SI-2026-0033'
  AND i.status = 'posted'
  AND i.total_amount = 5723.67
  AND customer.name = 'MEDI GLAM PHARMACY'
FOR UPDATE;

SELECT c.id INTO @cleanup_collection_id
FROM delivery_collections AS c
INNER JOIN collection_days AS day ON day.id = c.collection_day_id
WHERE c.request_key = '9a280498-0b61-4999-868f-6cd231d283b1'
  AND c.sales_invoice_id = @cleanup_invoice_id
  AND c.method = 'cash'
  AND c.reported_paisa = 500000
  AND c.verified_paisa = 0
  AND c.shortage_paisa = 0
  AND c.payment_id IS NULL
  AND c.included_in_opening = 0
  AND c.recorded_at IS NOT NULL
  AND day.business_date = '2026-11-24'
  AND day.closed_at IS NULL
  AND day.counted_cash_paisa IS NULL
  AND EXISTS (SELECT 1 FROM delivery_collections AS other_report
              WHERE other_report.collection_day_id = c.collection_day_id AND other_report.id <> c.id)
  AND NOT EXISTS (SELECT 1 FROM finance_work_items AS item
                  WHERE JSON_UNQUOTE(JSON_EXTRACT(item.payload, '$.collection_id')) = CAST(c.id AS CHAR)
                     OR JSON_UNQUOTE(JSON_EXTRACT(item.payload, '$.day_id')) = CAST(day.id AS CHAR))
  AND NOT EXISTS (SELECT 1 FROM treasury_entries AS entry
                  WHERE entry.source_type IN ('collection', 'delivery_collection', 'opening_collection') AND entry.source_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM finance_work_events AS event
                  WHERE (event.source_type = 'collection' AND event.source_id = c.id AND event.action NOT IN ('reported', 'verified'))
                     OR (event.source_type = 'collection_day' AND event.source_id = day.id AND event.action = 'matching_cash_recorded'
                         AND JSON_CONTAINS(JSON_EXTRACT(event.data, '$.collection_ids'), CAST(c.id AS CHAR))))
FOR UPDATE;

DELETE c, event
FROM delivery_collections AS c
LEFT JOIN finance_work_events AS event
    ON event.source_type = 'collection' AND event.source_id = c.id AND event.action IN ('reported', 'verified')
WHERE c.id = @cleanup_collection_id;

SELECT @cleanup_collection_id AS removed_collection_id, ROW_COUNT() AS removed_rows_including_events;

COMMIT;
