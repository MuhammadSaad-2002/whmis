-- Additive and rerunnable. Import after the operations schema SQL.
-- Preserves other permissions and does not grant collection/dispatch access to Bookers.
INSERT IGNORE INTO `permissions` (`name`,`guard_name`,`created_at`,`updated_at`) VALUES
('dispatch.view','web',NOW(),NOW()), ('dispatch.manage','web',NOW(),NOW()),
('collections.view','web',NOW(),NOW()), ('collections.manage','web',NOW(),NOW()),
('system.health','web',NOW(),NOW()), ('bookers.assign','web',NOW(),NOW());

INSERT IGNORE INTO `role_has_permissions` (`permission_id`,`role_id`)
SELECT p.id,r.id FROM permissions p JOIN roles r ON r.guard_name=p.guard_name
WHERE p.guard_name='web' AND (
  (r.name IN ('Super Admin','Admin') AND p.name IN ('dispatch.view','dispatch.manage','collections.view','collections.manage','system.health','bookers.assign'))
  OR (r.name='Warehouse Staff' AND p.name IN ('dispatch.view','dispatch.manage'))
  OR (r.name='Accountant' AND p.name IN ('dispatch.view','collections.view','collections.manage'))
);
-- After import: php artisan permission:cache-reset
