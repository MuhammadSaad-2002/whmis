-- Restores standard finance/commission grants to the existing Super Admin role only.
-- Safe to re-import; does not change any other role or financial records.
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`) VALUES
('distribution.reconcile','web',NOW(),NOW()),
('treasury.view','web',NOW(),NOW()), ('treasury.manage','web',NOW(),NOW()),
('finance.review','web',NOW(),NOW()), ('finance.request','web',NOW(),NOW()),
('finance.approve','web',NOW(),NOW()), ('finance.post','web',NOW(),NOW()),
('commission.manage','web',NOW(),NOW()), ('commission.waive','web',NOW(),NOW());

INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.id, r.id FROM `permissions` p JOIN `roles` r ON r.guard_name = p.guard_name
WHERE r.name = 'Super Admin' AND p.guard_name = 'web'
AND p.name IN ('distribution.reconcile', 'treasury.view', 'treasury.manage', 'finance.review',
    'finance.request', 'finance.approve', 'finance.post', 'commission.manage', 'commission.waive');

-- After import: php artisan permission:cache-reset
-- Reload the workspace. The matching Laravel migration can also run safely.
