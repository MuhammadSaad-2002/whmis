-- Back up first. Apply once, only if the corresponding Laravel migration is not applied.
ALTER TABLE bookings ADD COLUMN remainder_closed_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE booking_items ADD COLUMN cancelled_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN cancelled_bonus DECIMAL(12,2) NOT NULL DEFAULT 0;
CREATE TABLE booking_invoice_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_item_id BIGINT UNSIGNED NOT NULL, sales_invoice_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(12,2) NOT NULL, bonus_quantity DECIMAL(12,2) NOT NULL,
    UNIQUE KEY booking_invoice_line_unique (booking_item_id, sales_invoice_id),
    CONSTRAINT booking_invoice_lines_booking_item_id_foreign FOREIGN KEY (booking_item_id) REFERENCES booking_items(id),
    CONSTRAINT booking_invoice_lines_sales_invoice_id_foreign FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id)
) ENGINE=InnoDB;
ALTER TABLE sales_invoices ADD COLUMN planned_salesman_id BIGINT UNSIGNED NULL,
    ADD CONSTRAINT sales_invoices_planned_salesman_id_foreign FOREIGN KEY (planned_salesman_id) REFERENCES users(id);
ALTER TABLE dispatches ADD COLUMN custody_required TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN original_assignee_id BIGINT UNSIGNED NULL, ADD COLUMN custodian_id BIGINT UNSIGNED NULL,
    ADD COLUMN handover_to_id BIGINT UNSIGNED NULL, ADD COLUMN pickup_confirmed_at TIMESTAMP NULL DEFAULT NULL,
    ADD CONSTRAINT dispatches_original_assignee_id_foreign FOREIGN KEY (original_assignee_id) REFERENCES users(id),
    ADD CONSTRAINT dispatches_custodian_id_foreign FOREIGN KEY (custodian_id) REFERENCES users(id),
    ADD CONSTRAINT dispatches_handover_to_id_foreign FOREIGN KEY (handover_to_id) REFERENCES users(id);
CREATE TABLE sale_batch_allocations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, sales_invoice_item_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL, quantity DECIMAL(14,2) NOT NULL,
    CONSTRAINT sale_batch_allocations_sales_invoice_item_id_foreign FOREIGN KEY (sales_invoice_item_id) REFERENCES sales_invoice_items(id),
    CONSTRAINT sale_batch_allocations_batch_id_foreign FOREIGN KEY (batch_id) REFERENCES batches(id)
) ENGINE=InnoDB;
CREATE TABLE dispatch_pickup_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, dispatch_event_id BIGINT UNSIGNED NOT NULL,
    sale_batch_allocation_id BIGINT UNSIGNED NOT NULL, quantity DECIMAL(14,2) NOT NULL,
    UNIQUE KEY dispatch_pickup_line_unique (dispatch_event_id, sale_batch_allocation_id),
    CONSTRAINT dispatch_pickup_lines_dispatch_event_id_foreign FOREIGN KEY (dispatch_event_id) REFERENCES dispatch_events(id),
    CONSTRAINT dispatch_pickup_lines_sale_batch_allocation_id_foreign FOREIGN KEY (sale_batch_allocation_id) REFERENCES sale_batch_allocations(id)
) ENGINE=InnoDB;
INSERT INTO migrations (migration,batch)
SELECT '2026_11_24_000300_add_distribution_fulfilment', COALESCE(MAX(batch),0)+1 FROM migrations;
