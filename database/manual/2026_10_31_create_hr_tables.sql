-- WHMIS HR schema, companion to 2026_10_31_000100_create_hr_tables.
-- Import ONCE into the existing WHMIS database before deploying HR code.
-- Do not import if artisan migrate has already applied this migration.
-- DDL auto-commits in MySQL/MariaDB. Import with stop-on-error enabled.
-- After successful schema creation, the final statement registers the migration.

create table `hr_departments` (`id` bigint unsigned not null auto_increment primary key, `name` varchar(255) not null, `is_active` tinyint(1) not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `hr_departments` add unique `hr_departments_name_unique`(`name`);

create table `hr_designations` (`id` bigint unsigned not null auto_increment primary key, `name` varchar(255) not null, `is_active` tinyint(1) not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `hr_designations` add unique `hr_designations_name_unique`(`name`);

create table `employees` (`id` bigint unsigned not null auto_increment primary key, `employee_number` varchar(255) not null, `name` varchar(255) not null, `user_id` bigint unsigned null, `department_id` bigint unsigned null, `designation_id` bigint unsigned null, `manager_id` bigint unsigned null, `cnic` varchar(255) null, `phone` varchar(255) null, `email` varchar(255) null, `address` text null, `emergency_contact` varchar(255) null, `joining_date` date not null, `leaving_date` date null, `status` varchar(255) not null default 'active', `employment_type` varchar(255) not null default 'permanent', `is_booker` tinyint(1) not null default '0', `weekly_off_days` json not null, `notes` text null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `employees` add constraint `employees_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete restrict;

alter table `employees` add constraint `employees_department_id_foreign` foreign key (`department_id`) references `hr_departments` (`id`) on delete restrict;

alter table `employees` add constraint `employees_designation_id_foreign` foreign key (`designation_id`) references `hr_designations` (`id`) on delete restrict;

alter table `employees` add constraint `employees_manager_id_foreign` foreign key (`manager_id`) references `employees` (`id`) on delete restrict;

alter table `employees` add unique `employees_employee_number_unique`(`employee_number`);

alter table `employees` add unique `employees_user_id_unique`(`user_id`);

alter table `employees` add unique `employees_cnic_unique`(`cnic`);

create table `employee_salaries` (`id` bigint unsigned not null auto_increment primary key, `employee_id` bigint unsigned not null, `effective_from` date not null, `basic` decimal(15, 2) not null, `allowances` decimal(15, 2) not null default '0', `overtime_rate` decimal(15, 2) not null default '0', `sales_target` decimal(15, 2) not null default '0', `notes` text null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `employee_salaries` add constraint `employee_salaries_employee_id_foreign` foreign key (`employee_id`) references `employees` (`id`) on delete restrict;

alter table `employee_salaries` add unique `employee_salaries_employee_id_effective_from_unique`(`employee_id`, `effective_from`);

create table `employee_attendances` (`id` bigint unsigned not null auto_increment primary key, `employee_id` bigint unsigned not null, `date` date not null, `status` varchar(255) not null, `clock_in` time null, `clock_out` time null, `overtime_hours` decimal(6, 2) not null default '0', `notes` text null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `employee_attendances` add constraint `employee_attendances_employee_id_foreign` foreign key (`employee_id`) references `employees` (`id`) on delete restrict;

alter table `employee_attendances` add unique `employee_attendances_employee_id_date_unique`(`employee_id`, `date`);

create table `hr_leave_types` (`id` bigint unsigned not null auto_increment primary key, `name` varchar(255) not null, `is_paid` tinyint(1) not null default '1', `annual_days` smallint unsigned not null default '0', `is_active` tinyint(1) not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `hr_leave_types` add unique `hr_leave_types_name_unique`(`name`);

create table `employee_leaves` (`id` bigint unsigned not null auto_increment primary key, `employee_id` bigint unsigned not null, `leave_type_id` bigint unsigned not null, `from_date` date not null, `to_date` date not null, `days` smallint unsigned not null, `is_paid` tinyint(1) not null, `status` varchar(255) not null default 'pending', `reason` text not null, `approved_by` bigint unsigned null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `employee_leaves` add constraint `employee_leaves_employee_id_foreign` foreign key (`employee_id`) references `employees` (`id`) on delete restrict;

alter table `employee_leaves` add constraint `employee_leaves_leave_type_id_foreign` foreign key (`leave_type_id`) references `hr_leave_types` (`id`) on delete restrict;

alter table `employee_leaves` add constraint `employee_leaves_approved_by_foreign` foreign key (`approved_by`) references `users` (`id`) on delete restrict;

create table `payrolls` (`id` bigint unsigned not null auto_increment primary key, `number` varchar(255) not null, `period` date not null, `active_period` date null, `status` varchar(255) not null default 'draft', `posting_date` date null, `created_by` bigint unsigned null, `approved_by` bigint unsigned null, `posted_by` bigint unsigned null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `payrolls` add constraint `payrolls_created_by_foreign` foreign key (`created_by`) references `users` (`id`) on delete restrict;

alter table `payrolls` add constraint `payrolls_approved_by_foreign` foreign key (`approved_by`) references `users` (`id`) on delete restrict;

alter table `payrolls` add constraint `payrolls_posted_by_foreign` foreign key (`posted_by`) references `users` (`id`) on delete restrict;

alter table `payrolls` add unique `payrolls_number_unique`(`number`);

alter table `payrolls` add unique `payrolls_active_period_unique`(`active_period`);

create table `payroll_items` (`id` bigint unsigned not null auto_increment primary key, `payroll_id` bigint unsigned not null, `employee_id` bigint unsigned not null, `snapshot` json not null, `base` decimal(15, 2) not null default '0', `overtime` decimal(15, 2) not null default '0', `bonus` decimal(15, 2) not null default '0', `commission` decimal(15, 2) not null default '0', `deductions` decimal(15, 2) not null default '0', `recovery` decimal(15, 2) not null default '0', `expense` decimal(15, 2) not null default '0', `net_pay` decimal(15, 2) not null default '0', `notes` text null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `payroll_items` add constraint `payroll_items_payroll_id_foreign` foreign key (`payroll_id`) references `payrolls` (`id`) on delete restrict;

alter table `payroll_items` add constraint `payroll_items_employee_id_foreign` foreign key (`employee_id`) references `employees` (`id`) on delete restrict;

alter table `payroll_items` add unique `payroll_items_payroll_id_employee_id_unique`(`payroll_id`, `employee_id`);

create table `hr_transactions` (`id` bigint unsigned not null auto_increment primary key, `number` varchar(255) not null, `employee_id` bigint unsigned not null, `payroll_item_id` bigint unsigned null, `reverses_id` bigint unsigned null, `date` date not null, `kind` varchar(255) not null, `method` varchar(255) null, `reference` varchar(255) null, `expense` decimal(15, 2) not null default '0', `payable` decimal(15, 2) not null default '0', `advance` decimal(15, 2) not null default '0', `cash_out` decimal(15, 2) not null default '0', `notes` text not null, `created_by` bigint unsigned null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `hr_transactions` add constraint `hr_transactions_employee_id_foreign` foreign key (`employee_id`) references `employees` (`id`) on delete restrict;

alter table `hr_transactions` add constraint `hr_transactions_payroll_item_id_foreign` foreign key (`payroll_item_id`) references `payroll_items` (`id`) on delete restrict;

alter table `hr_transactions` add constraint `hr_transactions_reverses_id_foreign` foreign key (`reverses_id`) references `hr_transactions` (`id`) on delete restrict;

alter table `hr_transactions` add constraint `hr_transactions_created_by_foreign` foreign key (`created_by`) references `users` (`id`) on delete restrict;

alter table `hr_transactions` add index `hr_transactions_employee_id_date_index`(`employee_id`, `date`);

alter table `hr_transactions` add unique `hr_transactions_number_unique`(`number`);

alter table `hr_transactions` add unique `hr_transactions_reverses_id_unique`(`reverses_id`);

INSERT INTO migrations (migration, batch)
SELECT '2026_10_31_000100_create_hr_tables', COALESCE(MAX(batch), 0) + 1 FROM migrations
HAVING NOT EXISTS (SELECT 1 FROM migrations WHERE migration = '2026_10_31_000100_create_hr_tables');
