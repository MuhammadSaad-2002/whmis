-- WHMIS ERP — clean production seed (import into an EMPTY vwisdomo_whmis).
-- Tables + baseline data only (roles, permissions, admin user, default
-- warehouse, number series). No test/sample records. Generated for first deploy.
SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `audits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audits` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_type` varchar(255) DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `event` varchar(255) NOT NULL,
  `auditable_type` varchar(255) NOT NULL,
  `auditable_id` bigint(20) unsigned NOT NULL,
  `old_values` text DEFAULT NULL,
  `new_values` text DEFAULT NULL,
  `url` text DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(1023) DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `audits_auditable_type_auditable_id_index` (`auditable_type`,`auditable_id`),
  KEY `audits_user_id_user_type_index` (`user_id`,`user_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `audits` WRITE;
/*!40000 ALTER TABLE `audits` DISABLE KEYS */;
/*!40000 ALTER TABLE `audits` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `batches` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint(20) unsigned NOT NULL,
  `warehouse_id` bigint(20) unsigned NOT NULL,
  `batch_number` varchar(255) NOT NULL,
  `expiry_date` date DEFAULT NULL,
  `purchase_rate` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `effective_cost` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `trade_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `retail_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `qty_purchased` decimal(12,2) NOT NULL DEFAULT 0.00,
  `qty_bonus` decimal(12,2) NOT NULL DEFAULT 0.00,
  `qty_sold` decimal(12,2) NOT NULL DEFAULT 0.00,
  `qty_reserved` decimal(12,2) NOT NULL DEFAULT 0.00,
  `qty_available` decimal(12,2) NOT NULL DEFAULT 0.00,
  `purchase_invoice_item_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `batches_warehouse_id_foreign` (`warehouse_id`),
  KEY `batches_product_id_warehouse_id_expiry_date_index` (`product_id`,`warehouse_id`,`expiry_date`),
  KEY `batches_batch_number_index` (`batch_number`),
  CONSTRAINT `batches_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `batches_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `batches` WRITE;
/*!40000 ALTER TABLE `batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `batches` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `booking_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `requested_bonus` decimal(12,2) NOT NULL DEFAULT 0.00,
  `applied_rule_id` bigint(20) unsigned DEFAULT NULL,
  `trade_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `gst_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `gst_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `net_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `remarks` varchar(255) DEFAULT NULL,
  `sort_order` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `booking_items_booking_id_foreign` (`booking_id`),
  KEY `booking_items_product_id_foreign` (`product_id`),
  CONSTRAINT `booking_items_booking_id_foreign` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `booking_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `booking_items` WRITE;
/*!40000 ALTER TABLE `booking_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `booking_items` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bookings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `booking_number` varchar(255) NOT NULL,
  `customer_id` bigint(20) unsigned NOT NULL,
  `booker_id` bigint(20) unsigned NOT NULL,
  `warehouse_id` bigint(20) unsigned NOT NULL,
  `booking_date` date NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'draft',
  `subtotal` decimal(15,2) NOT NULL DEFAULT 0.00,
  `item_discount_total` decimal(15,2) NOT NULL DEFAULT 0.00,
  `item_gst_total` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `sales_invoice_id` bigint(20) unsigned DEFAULT NULL,
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bookings_booking_number_unique` (`booking_number`),
  KEY `bookings_warehouse_id_foreign` (`warehouse_id`),
  KEY `bookings_sales_invoice_id_foreign` (`sales_invoice_id`),
  KEY `bookings_approved_by_foreign` (`approved_by`),
  KEY `bookings_created_by_foreign` (`created_by`),
  KEY `bookings_customer_id_booking_date_index` (`customer_id`,`booking_date`),
  KEY `bookings_booker_id_status_index` (`booker_id`,`status`),
  CONSTRAINT `bookings_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bookings_booker_id_foreign` FOREIGN KEY (`booker_id`) REFERENCES `users` (`id`),
  CONSTRAINT `bookings_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bookings_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `bookings_sales_invoice_id_foreign` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bookings_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cache` (
  `key` varchar(255) NOT NULL,
  `value` mediumtext NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `cache` WRITE;
/*!40000 ALTER TABLE `cache` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) NOT NULL,
  `owner` varchar(255) NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `cache_locks` WRITE;
/*!40000 ALTER TABLE `cache_locks` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache_locks` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `whatsapp` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `gst_number` varchar(255) DEFAULT NULL,
  `ntn_number` varchar(255) DEFAULT NULL,
  `payment_terms` varchar(255) DEFAULT NULL,
  `credit_days` int(10) unsigned NOT NULL DEFAULT 0,
  `credit_limit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
/*!40000 ALTER TABLE `companies` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customers` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `drug_license_no` varchar(255) DEFAULT NULL,
  `registration_no` varchar(255) DEFAULT NULL,
  `ntn` varchar(255) DEFAULT NULL,
  `strn` varchar(255) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `cnic` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `whatsapp` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `region` varchar(255) DEFAULT NULL,
  `credit_limit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `payment_terms` varchar(255) DEFAULT NULL,
  `credit_days` int(10) unsigned NOT NULL DEFAULT 0,
  `booker_id` bigint(20) unsigned DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customers_name_index` (`name`),
  KEY `customers_city_index` (`city`),
  KEY `customers_booker_id_foreign` (`booker_id`),
  CONSTRAINT `customers_booker_id_foreign` FOREIGN KEY (`booker_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `failed_jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `connection` text NOT NULL,
  `queue` text NOT NULL,
  `payload` longtext NOT NULL,
  `exception` longtext NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `failed_jobs` WRITE;
/*!40000 ALTER TABLE `failed_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `failed_jobs` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `incentive_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `incentive_rules` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `rule_type` varchar(255) NOT NULL,
  `product_id` bigint(20) unsigned DEFAULT NULL,
  `company_id` bigint(20) unsigned DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `base_qty` decimal(12,2) DEFAULT NULL,
  `bonus_qty` decimal(12,2) DEFAULT NULL,
  `slabs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`slabs`)),
  `value` decimal(15,2) DEFAULT NULL,
  `min_qty` decimal(12,2) DEFAULT NULL,
  `date_from` date DEFAULT NULL,
  `date_to` date DEFAULT NULL,
  `priority` int(11) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `incentive_rules_product_id_foreign` (`product_id`),
  KEY `incentive_rules_company_id_foreign` (`company_id`),
  KEY `incentive_rules_customer_id_foreign` (`customer_id`),
  KEY `incentive_rules_active_product_id_index` (`active`,`product_id`),
  CONSTRAINT `incentive_rules_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `incentive_rules_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `incentive_rules_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `incentive_rules` WRITE;
/*!40000 ALTER TABLE `incentive_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `incentive_rules` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_jobs` int(11) NOT NULL,
  `pending_jobs` int(11) NOT NULL,
  `failed_jobs` int(11) NOT NULL,
  `failed_job_ids` longtext NOT NULL,
  `options` mediumtext DEFAULT NULL,
  `cancelled_at` int(11) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  `finished_at` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `job_batches` WRITE;
/*!40000 ALTER TABLE `job_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `job_batches` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) NOT NULL,
  `payload` longtext NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL,
  `reserved_at` int(10) unsigned DEFAULT NULL,
  `available_at` int(10) unsigned NOT NULL,
  `created_at` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ledger_entries` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `party_type` varchar(255) NOT NULL,
  `party_id` bigint(20) unsigned NOT NULL,
  `entry_date` date NOT NULL,
  `entry_type` varchar(255) NOT NULL,
  `reference_type` varchar(255) DEFAULT NULL,
  `reference_id` bigint(20) unsigned DEFAULT NULL,
  `debit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `credit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `description` varchar(255) DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ledger_entries_party_type_party_id_index` (`party_type`,`party_id`),
  KEY `ledger_entries_reference_type_reference_id_index` (`reference_type`,`reference_id`),
  KEY `ledger_entries_created_by_foreign` (`created_by`),
  KEY `ledger_entries_party_type_party_id_entry_date_index` (`party_type`,`party_id`,`entry_date`),
  CONSTRAINT `ledger_entries_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `ledger_entries` WRITE;
/*!40000 ALTER TABLE `ledger_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `ledger_entries` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2026_07_04_192621_create_audits_table',1),(5,'2026_07_04_192621_create_permission_tables',1),(6,'2026_07_04_205333_create_notifications_table',1),(7,'2026_07_05_000100_create_master_tables',1),(8,'2026_07_05_000200_create_inventory_tables',1),(9,'2026_07_05_000300_create_invoice_tables',1),(10,'2026_07_05_000400_create_finance_tables',1),(11,'2026_07_05_000500_create_stock_adjustments_table',1),(12,'2026_07_05_010000_create_booking_and_incentive_tables',1),(13,'2026_07_05_020000_create_return_tables',1),(14,'2026_07_06_000100_add_sale_terms_to_sales_invoices',1);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `model_has_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `model_has_permissions` (
  `permission_id` bigint(20) unsigned NOT NULL,
  `model_type` varchar(255) NOT NULL,
  `model_id` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`permission_id`,`model_id`,`model_type`),
  KEY `model_has_permissions_model_id_model_type_index` (`model_id`,`model_type`),
  CONSTRAINT `model_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `model_has_permissions` WRITE;
/*!40000 ALTER TABLE `model_has_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `model_has_permissions` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `model_has_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `model_has_roles` (
  `role_id` bigint(20) unsigned NOT NULL,
  `model_type` varchar(255) NOT NULL,
  `model_id` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`role_id`,`model_id`,`model_type`),
  KEY `model_has_roles_model_id_model_type_index` (`model_id`,`model_type`),
  CONSTRAINT `model_has_roles_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `model_has_roles` WRITE;
/*!40000 ALTER TABLE `model_has_roles` DISABLE KEYS */;
INSERT INTO `model_has_roles` VALUES (1,'user',1);
/*!40000 ALTER TABLE `model_has_roles` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `id` char(36) NOT NULL,
  `type` varchar(255) NOT NULL,
  `notifiable_type` varchar(255) NOT NULL,
  `notifiable_id` bigint(20) unsigned NOT NULL,
  `data` text NOT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_notifiable_type_notifiable_id_index` (`notifiable_type`,`notifiable_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `number_series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `number_series` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `doc_type` varchar(255) NOT NULL,
  `prefix` varchar(255) NOT NULL,
  `next_number` bigint(20) unsigned NOT NULL DEFAULT 1,
  `padding` tinyint(3) unsigned NOT NULL DEFAULT 4,
  `yearly` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `number_series_doc_type_unique` (`doc_type`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `number_series` WRITE;
/*!40000 ALTER TABLE `number_series` DISABLE KEYS */;
INSERT INTO `number_series` VALUES (1,'purchase_invoice','PI',1,4,1,'2026-07-06 06:21:55','2026-07-06 06:21:55'),(2,'sales_invoice','SI',1,4,1,'2026-07-06 06:21:55','2026-07-06 06:21:55'),(3,'payment_in','RCV',1,4,1,'2026-07-06 06:21:55','2026-07-06 06:21:55'),(4,'payment_out','PAY',1,4,1,'2026-07-06 06:21:55','2026-07-06 06:21:55'),(5,'stock_adjustment','ADJ',1,4,1,'2026-07-06 06:21:55','2026-07-06 06:21:55'),(6,'booking','BK',1,4,1,'2026-07-06 06:21:55','2026-07-06 06:21:55'),(7,'sales_return','SR',1,4,1,'2026-07-06 06:21:55','2026-07-06 06:21:55'),(8,'purchase_return','PR',1,4,1,'2026-07-06 06:21:55','2026-07-06 06:21:55');
/*!40000 ALTER TABLE `number_series` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `payment_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_allocations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payment_id` bigint(20) unsigned NOT NULL,
  `invoice_type` varchar(255) NOT NULL,
  `invoice_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `payment_allocations_payment_id_foreign` (`payment_id`),
  KEY `payment_allocations_invoice_type_invoice_id_index` (`invoice_type`,`invoice_id`),
  CONSTRAINT `payment_allocations_payment_id_foreign` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `payment_allocations` WRITE;
/*!40000 ALTER TABLE `payment_allocations` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment_allocations` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payment_number` varchar(255) NOT NULL,
  `party_type` varchar(255) NOT NULL,
  `party_id` bigint(20) unsigned NOT NULL,
  `direction` varchar(255) NOT NULL,
  `method` varchar(255) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_date` date NOT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `cheque_number` varchar(255) DEFAULT NULL,
  `cheque_date` date DEFAULT NULL,
  `reference_no` varchar(255) DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'completed',
  `notes` text DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payments_payment_number_unique` (`payment_number`),
  KEY `payments_party_type_party_id_index` (`party_type`,`party_id`),
  KEY `payments_created_by_foreign` (`created_by`),
  KEY `payments_party_type_party_id_payment_date_index` (`party_type`,`party_id`,`payment_date`),
  CONSTRAINT `payments_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `permissions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `guard_name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_name_guard_name_unique` (`name`,`guard_name`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'suppliers.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(2,'suppliers.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(3,'categories.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(4,'categories.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(5,'products.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(6,'products.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(7,'customers.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(8,'customers.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(9,'purchases.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(10,'purchases.create','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(11,'purchases.post','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(12,'purchases.cancel','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(13,'sales.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(14,'sales.create','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(15,'sales.post','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(16,'sales.cancel','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(17,'bookings.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(18,'bookings.create','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(19,'bookings.approve','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(20,'bookings.convert','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(21,'incentives.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(22,'incentives.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(23,'returns.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(24,'returns.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(25,'inventory.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(26,'inventory.adjust','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(27,'payments.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(28,'payments.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(29,'ledger.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(30,'reports.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(31,'dashboard.view','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(32,'users.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(33,'settings.manage','web','2026-07-06 06:21:54','2026-07-06 06:21:54');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `product_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_categories` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_categories_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `product_categories` WRITE;
/*!40000 ALTER TABLE `product_categories` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_categories` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `products` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `generic_name` varchar(255) DEFAULT NULL,
  `brand_name` varchar(255) DEFAULT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `category_id` bigint(20) unsigned DEFAULT NULL,
  `product_type` varchar(255) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `barcode` varchar(255) DEFAULT NULL,
  `pack_size` varchar(255) DEFAULT NULL,
  `purchase_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `trade_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `retail_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `mrp` decimal(15,2) NOT NULL DEFAULT 0.00,
  `tax_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `default_discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `min_stock` decimal(12,2) NOT NULL DEFAULT 0.00,
  `reorder_level` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `products_company_id_foreign` (`company_id`),
  KEY `products_category_id_foreign` (`category_id`),
  KEY `products_name_index` (`name`),
  KEY `products_barcode_index` (`barcode`),
  CONSTRAINT `products_category_id_foreign` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `products_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `purchase_invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_invoice_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `purchase_invoice_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `batch_number` varchar(255) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `bonus_quantity` decimal(12,2) NOT NULL DEFAULT 0.00,
  `purchase_rate` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `trade_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `retail_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `gst_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `gst_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `net_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `margin` decimal(15,2) NOT NULL DEFAULT 0.00,
  `margin_percent` decimal(8,2) NOT NULL DEFAULT 0.00,
  `remarks` varchar(255) DEFAULT NULL,
  `batch_id` bigint(20) unsigned DEFAULT NULL,
  `sort_order` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_invoice_items_purchase_invoice_id_foreign` (`purchase_invoice_id`),
  KEY `purchase_invoice_items_product_id_foreign` (`product_id`),
  KEY `purchase_invoice_items_batch_id_foreign` (`batch_id`),
  CONSTRAINT `purchase_invoice_items_batch_id_foreign` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `purchase_invoice_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `purchase_invoice_items_purchase_invoice_id_foreign` FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `purchase_invoice_items` WRITE;
/*!40000 ALTER TABLE `purchase_invoice_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_invoice_items` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `purchase_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_invoices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(255) NOT NULL,
  `supplier_invoice_number` varchar(255) DEFAULT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `warehouse_id` bigint(20) unsigned NOT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `purchase_type` varchar(255) NOT NULL DEFAULT 'credit',
  `status` varchar(255) NOT NULL DEFAULT 'draft',
  `subtotal` decimal(15,2) NOT NULL DEFAULT 0.00,
  `item_discount_total` decimal(15,2) NOT NULL DEFAULT 0.00,
  `item_gst_total` decimal(15,2) NOT NULL DEFAULT 0.00,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `gst_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `gst_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_margin` decimal(15,2) NOT NULL DEFAULT 0.00,
  `margin_percent` decimal(8,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `posted_at` timestamp NULL DEFAULT NULL,
  `posted_by` bigint(20) unsigned DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_invoices_invoice_number_unique` (`invoice_number`),
  KEY `purchase_invoices_warehouse_id_foreign` (`warehouse_id`),
  KEY `purchase_invoices_posted_by_foreign` (`posted_by`),
  KEY `purchase_invoices_created_by_foreign` (`created_by`),
  KEY `purchase_invoices_company_id_invoice_date_index` (`company_id`,`invoice_date`),
  KEY `purchase_invoices_status_index` (`status`),
  CONSTRAINT `purchase_invoices_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `purchase_invoices_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `purchase_invoices_posted_by_foreign` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `purchase_invoices_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `purchase_invoices` WRITE;
/*!40000 ALTER TABLE `purchase_invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_invoices` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `purchase_return_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_return_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `purchase_return_id` bigint(20) unsigned NOT NULL,
  `batch_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `rate` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `net_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_return_items_purchase_return_id_foreign` (`purchase_return_id`),
  KEY `purchase_return_items_batch_id_foreign` (`batch_id`),
  KEY `purchase_return_items_product_id_foreign` (`product_id`),
  CONSTRAINT `purchase_return_items_batch_id_foreign` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `purchase_return_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `purchase_return_items_purchase_return_id_foreign` FOREIGN KEY (`purchase_return_id`) REFERENCES `purchase_returns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `purchase_return_items` WRITE;
/*!40000 ALTER TABLE `purchase_return_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_return_items` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `purchase_returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_returns` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `return_number` varchar(255) NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `warehouse_id` bigint(20) unsigned NOT NULL,
  `return_date` date NOT NULL,
  `total_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `reason` varchar(255) DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_returns_return_number_unique` (`return_number`),
  KEY `purchase_returns_warehouse_id_foreign` (`warehouse_id`),
  KEY `purchase_returns_created_by_foreign` (`created_by`),
  KEY `purchase_returns_company_id_return_date_index` (`company_id`,`return_date`),
  CONSTRAINT `purchase_returns_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `purchase_returns_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `purchase_returns_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `purchase_returns` WRITE;
/*!40000 ALTER TABLE `purchase_returns` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_returns` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `role_has_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `role_has_permissions` (
  `permission_id` bigint(20) unsigned NOT NULL,
  `role_id` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`permission_id`,`role_id`),
  KEY `role_has_permissions_role_id_foreign` (`role_id`),
  CONSTRAINT `role_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_has_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `role_has_permissions` WRITE;
/*!40000 ALTER TABLE `role_has_permissions` DISABLE KEYS */;
INSERT INTO `role_has_permissions` VALUES (1,1),(1,2),(1,4),(2,1),(2,2),(3,1),(3,2),(4,1),(4,2),(5,1),(5,2),(5,3),(5,5),(6,1),(6,2),(7,1),(7,2),(7,3),(7,4),(8,1),(8,2),(9,1),(9,2),(9,4),(9,5),(10,1),(10,2),(11,1),(11,2),(12,1),(12,2),(13,1),(13,2),(13,4),(13,5),(14,1),(14,2),(15,1),(15,2),(16,1),(16,2),(17,1),(17,2),(17,3),(17,4),(18,1),(18,2),(18,3),(19,1),(19,2),(20,1),(20,2),(21,1),(21,2),(22,1),(23,1),(23,2),(23,4),(24,1),(24,2),(25,1),(25,2),(25,5),(26,1),(26,2),(26,5),(27,1),(27,2),(27,4),(28,1),(28,2),(28,4),(29,1),(29,2),(29,4),(30,1),(30,2),(30,4),(31,1),(31,2),(31,3),(31,4),(31,5),(32,1),(33,1);
/*!40000 ALTER TABLE `role_has_permissions` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `roles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `guard_name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_name_guard_name_unique` (`name`,`guard_name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'Super Admin','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(2,'Admin','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(3,'Booker','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(4,'Accountant','web','2026-07-06 06:21:54','2026-07-06 06:21:54'),(5,'Warehouse Staff','web','2026-07-06 06:21:54','2026-07-06 06:21:54');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `sales_invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_invoice_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sales_invoice_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `batch_id` bigint(20) unsigned DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `bonus_quantity` decimal(12,2) NOT NULL DEFAULT 0.00,
  `applied_rule_id` bigint(20) unsigned DEFAULT NULL,
  `trade_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `gst_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `gst_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `net_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `cost_amount` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `profit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `profit_percent` decimal(8,2) NOT NULL DEFAULT 0.00,
  `remarks` varchar(255) DEFAULT NULL,
  `sort_order` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sales_invoice_items_sales_invoice_id_foreign` (`sales_invoice_id`),
  KEY `sales_invoice_items_product_id_foreign` (`product_id`),
  KEY `sales_invoice_items_batch_id_foreign` (`batch_id`),
  CONSTRAINT `sales_invoice_items_batch_id_foreign` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `sales_invoice_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `sales_invoice_items_sales_invoice_id_foreign` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sales_invoice_items` WRITE;
/*!40000 ALTER TABLE `sales_invoice_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_invoice_items` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `sales_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_invoices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(255) NOT NULL,
  `manual_number` tinyint(1) NOT NULL DEFAULT 0,
  `customer_id` bigint(20) unsigned NOT NULL,
  `warehouse_id` bigint(20) unsigned NOT NULL,
  `booking_id` bigint(20) unsigned DEFAULT NULL,
  `sale_type` varchar(255) NOT NULL DEFAULT 'credit',
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'draft',
  `subtotal` decimal(15,2) NOT NULL DEFAULT 0.00,
  `item_discount_total` decimal(15,2) NOT NULL DEFAULT 0.00,
  `item_gst_total` decimal(15,2) NOT NULL DEFAULT 0.00,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `gst_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `gst_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_profit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `profit_percent` decimal(8,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `sale_terms` text DEFAULT NULL,
  `posted_at` timestamp NULL DEFAULT NULL,
  `posted_by` bigint(20) unsigned DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sales_invoices_invoice_number_unique` (`invoice_number`),
  KEY `sales_invoices_warehouse_id_foreign` (`warehouse_id`),
  KEY `sales_invoices_posted_by_foreign` (`posted_by`),
  KEY `sales_invoices_created_by_foreign` (`created_by`),
  KEY `sales_invoices_customer_id_invoice_date_index` (`customer_id`,`invoice_date`),
  KEY `sales_invoices_status_index` (`status`),
  CONSTRAINT `sales_invoices_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sales_invoices_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `sales_invoices_posted_by_foreign` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sales_invoices_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sales_invoices` WRITE;
/*!40000 ALTER TABLE `sales_invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_invoices` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `sales_return_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_return_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sales_return_id` bigint(20) unsigned NOT NULL,
  `sales_invoice_item_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `batch_id` bigint(20) unsigned DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `unit_price` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `net_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `cost_amount` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sales_return_items_sales_return_id_foreign` (`sales_return_id`),
  KEY `sales_return_items_sales_invoice_item_id_foreign` (`sales_invoice_item_id`),
  KEY `sales_return_items_product_id_foreign` (`product_id`),
  KEY `sales_return_items_batch_id_foreign` (`batch_id`),
  CONSTRAINT `sales_return_items_batch_id_foreign` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `sales_return_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `sales_return_items_sales_invoice_item_id_foreign` FOREIGN KEY (`sales_invoice_item_id`) REFERENCES `sales_invoice_items` (`id`),
  CONSTRAINT `sales_return_items_sales_return_id_foreign` FOREIGN KEY (`sales_return_id`) REFERENCES `sales_returns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sales_return_items` WRITE;
/*!40000 ALTER TABLE `sales_return_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_return_items` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `sales_returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_returns` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `return_number` varchar(255) NOT NULL,
  `sales_invoice_id` bigint(20) unsigned NOT NULL,
  `customer_id` bigint(20) unsigned NOT NULL,
  `warehouse_id` bigint(20) unsigned NOT NULL,
  `return_date` date NOT NULL,
  `total_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` decimal(15,2) NOT NULL DEFAULT 0.00,
  `reason` varchar(255) DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sales_returns_return_number_unique` (`return_number`),
  KEY `sales_returns_sales_invoice_id_foreign` (`sales_invoice_id`),
  KEY `sales_returns_warehouse_id_foreign` (`warehouse_id`),
  KEY `sales_returns_created_by_foreign` (`created_by`),
  KEY `sales_returns_customer_id_return_date_index` (`customer_id`,`return_date`),
  CONSTRAINT `sales_returns_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sales_returns_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `sales_returns_sales_invoice_id_foreign` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices` (`id`),
  CONSTRAINT `sales_returns_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sales_returns` WRITE;
/*!40000 ALTER TABLE `sales_returns` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_returns` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sessions` (
  `id` varchar(255) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` longtext NOT NULL,
  `last_activity` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `stock_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stock_adjustments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `adjustment_number` varchar(255) NOT NULL,
  `batch_id` bigint(20) unsigned NOT NULL,
  `warehouse_id` bigint(20) unsigned NOT NULL,
  `type` varchar(255) NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `adjustment_date` date NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_adjustments_adjustment_number_unique` (`adjustment_number`),
  KEY `stock_adjustments_batch_id_foreign` (`batch_id`),
  KEY `stock_adjustments_warehouse_id_foreign` (`warehouse_id`),
  KEY `stock_adjustments_created_by_foreign` (`created_by`),
  CONSTRAINT `stock_adjustments_batch_id_foreign` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `stock_adjustments_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `stock_adjustments_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `stock_adjustments` WRITE;
/*!40000 ALTER TABLE `stock_adjustments` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_adjustments` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `stock_movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stock_movements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `batch_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `warehouse_id` bigint(20) unsigned NOT NULL,
  `type` varchar(255) NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `unit_cost` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `reference_type` varchar(255) DEFAULT NULL,
  `reference_id` bigint(20) unsigned DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `stock_movements_batch_id_foreign` (`batch_id`),
  KEY `stock_movements_warehouse_id_foreign` (`warehouse_id`),
  KEY `stock_movements_reference_type_reference_id_index` (`reference_type`,`reference_id`),
  KEY `stock_movements_user_id_foreign` (`user_id`),
  KEY `stock_movements_product_id_created_at_index` (`product_id`,`created_at`),
  CONSTRAINT `stock_movements_batch_id_foreign` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `stock_movements_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `stock_movements_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `stock_movements_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `stock_movements` WRITE;
/*!40000 ALTER TABLE `stock_movements` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_movements` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `remember_token` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Super Admin','admin@whmis.local','2026-07-06 06:21:54','$2y$12$iraRIIvTUPyC0CuYIz2VwuzUcGX48tbvvmDbL4KVoveh6eIhuPyA6',NULL,'2026-07-06 06:21:55','2026-07-06 06:21:55');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `warehouses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `warehouses` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `code` varchar(255) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `warehouses_code_unique` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `warehouses` WRITE;
/*!40000 ALTER TABLE `warehouses` DISABLE KEYS */;
INSERT INTO `warehouses` VALUES (1,'Main Warehouse','MAIN',NULL,1,'active','2026-07-06 06:21:55','2026-07-06 06:21:55');
/*!40000 ALTER TABLE `warehouses` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


SET FOREIGN_KEY_CHECKS=1;
