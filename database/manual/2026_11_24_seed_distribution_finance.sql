-- Rerunnable, additive; run php artisan permission:cache-reset afterward.
INSERT IGNORE INTO permissions (name, guard_name, created_at, updated_at) VALUES
('distribution.reconcile','web',NOW(),NOW()), ('treasury.view','web',NOW(),NOW()), ('treasury.manage','web',NOW(),NOW()),
('finance.review','web',NOW(),NOW()), ('finance.request','web',NOW(),NOW()), ('finance.approve','web',NOW(),NOW()), ('finance.post','web',NOW(),NOW());
INSERT IGNORE INTO permissions (name, guard_name, created_at, updated_at) VALUES
('commission.self','web',NOW(),NOW()),('commission.manage','web',NOW(),NOW()),('commission.waive','web',NOW(),NOW());
INSERT IGNORE INTO role_has_permissions (permission_id,role_id)
SELECT p.id,r.id FROM permissions p JOIN roles r ON r.guard_name=p.guard_name
WHERE p.guard_name='web' AND (
(r.name='Super Admin' AND p.name IN ('distribution.reconcile','treasury.view','treasury.manage','finance.review','finance.request','finance.approve','finance.post'))
OR (r.name='Admin' AND p.name IN ('distribution.reconcile','treasury.view','treasury.manage','finance.review','finance.request','finance.post'))
OR (r.name='Accountant' AND p.name IN ('distribution.reconcile','treasury.view','finance.review','finance.request','finance.post'))
OR (r.name IN ('Booker','Salesman','Admin','Super Admin') AND p.name='commission.self')
OR (r.name IN ('Admin','Super Admin') AND p.name='commission.manage')
OR (r.name='Super Admin' AND p.name='commission.waive')
);
