-- Additive HR permission grants; safe to rerun. Does not reset existing roles.
-- Run after the schema SQL. Clear the permission cache after import:
-- php artisan permission:cache-reset (or clear application cache in deployment).
INSERT IGNORE INTO permissions (name,guard_name,created_at,updated_at) VALUES
('employees.view','web',NOW(),NOW()),
('employees.manage','web',NOW(),NOW()),
('hr.settings.manage','web',NOW(),NOW()),
('hr.attendance.view','web',NOW(),NOW()),
('hr.attendance.manage','web',NOW(),NOW()),
('hr.leave.view','web',NOW(),NOW()),
('hr.leave.manage','web',NOW(),NOW()),
('hr.leave.approve','web',NOW(),NOW()),
('hr.payroll.view','web',NOW(),NOW()),
('hr.payroll.manage','web',NOW(),NOW()),
('hr.payroll.approve','web',NOW(),NOW()),
('hr.payroll.post','web',NOW(),NOW()),
('hr.payroll.pay','web',NOW(),NOW()),
('hr.payroll.cancel','web',NOW(),NOW()),
('hr.reports.view','web',NOW(),NOW()),
('hr.self.view','web',NOW(),NOW());
INSERT IGNORE INTO roles (name,guard_name,created_at,updated_at) VALUES ('HR Manager','web',NOW(),NOW());
INSERT IGNORE INTO role_has_permissions (permission_id,role_id)
SELECT p.id,r.id FROM permissions p JOIN roles r ON r.guard_name=p.guard_name
WHERE r.guard_name='web' AND (
(r.name IN ('Super Admin','Admin','HR Manager') AND p.name IN ('employees.view','employees.manage','hr.settings.manage','hr.attendance.view','hr.attendance.manage','hr.leave.view','hr.leave.manage','hr.leave.approve','hr.payroll.view','hr.payroll.manage','hr.payroll.approve','hr.payroll.post','hr.payroll.pay','hr.payroll.cancel','hr.reports.view','hr.self.view'))
OR (r.name='HR Manager' AND p.name='reports.view')
OR (r.name='Accountant' AND p.name IN ('employees.view','hr.payroll.view','hr.payroll.manage','hr.payroll.post','hr.payroll.pay','hr.reports.view','hr.self.view'))
OR (r.name IN ('Booker','Warehouse Staff') AND p.name='hr.self.view')
);
