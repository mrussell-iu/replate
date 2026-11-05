-- Replate schema. Safe to rerun without deleting donation data.
CREATE DATABASE IF NOT EXISTS replate;
USE replate;

CREATE TABLE IF NOT EXISTS organizations (
  organization_id INT AUTO_INCREMENT PRIMARY KEY,
  organization_name VARCHAR(150) NOT NULL,
  organization_type ENUM('FOODSERVICE','RECIPIENT') NOT NULL,
  address VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('FOOD_DONOR','RECIPIENT','ADMIN') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(organization_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS donations (
  donation_id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  recipient_user_id INT NULL,
  food_type VARCHAR(100) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  quantity_unit VARCHAR(30) NOT NULL,
  pickup_address VARCHAR(255) NOT NULL,
  pickup_date DATE NOT NULL,
  pickup_time TIME NOT NULL,
  claim_deadline DATETIME NOT NULL,
  additional_information TEXT,
  status ENUM('AVAILABLE','CLAIMED','COMPLETED') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  pickup_confirmed_at DATETIME NULL,
  pickup_confirmed_by INT NULL,
  CONSTRAINT fk_donations_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(organization_id),
  CONSTRAINT fk_donations_recipient FOREIGN KEY (recipient_user_id)
    REFERENCES users(user_id)
) ENGINE=InnoDB;

-- Upgrade older donations tables without dropping records.
SET @has_pickup_at = (SELECT COUNT(*) FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name='donations' AND column_name='pickup_confirmed_at');
SET @stmt = IF(@has_pickup_at=0,
 'ALTER TABLE donations ADD COLUMN pickup_confirmed_at DATETIME NULL', 'SELECT 1');
PREPARE migration FROM @stmt; EXECUTE migration; DEALLOCATE PREPARE migration;
SET @has_pickup_by = (SELECT COUNT(*) FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name='donations' AND column_name='pickup_confirmed_by');
SET @stmt = IF(@has_pickup_by=0,
 'ALTER TABLE donations ADD COLUMN pickup_confirmed_by INT NULL', 'SELECT 1');
PREPARE migration FROM @stmt; EXECUTE migration; DEALLOCATE PREPARE migration;
SET @has_recipient = (SELECT COUNT(*) FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name='donations' AND column_name='recipient_user_id');
SET @stmt = IF(@has_recipient=0,
 'ALTER TABLE donations ADD COLUMN recipient_user_id INT NULL', 'SELECT 1');
PREPARE migration FROM @stmt; EXECUTE migration; DEALLOCATE PREPARE migration;

CREATE TABLE IF NOT EXISTS claims (
  claim_id INT AUTO_INCREMENT PRIMARY KEY,
  donation_id INT NOT NULL UNIQUE,
  recipient_id INT NOT NULL,
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  claim_status ENUM('CLAIMED','COMPLETED','CANCELLED') DEFAULT 'CLAIMED',
  CONSTRAINT fk_claims_donation FOREIGN KEY (donation_id)
    REFERENCES donations(donation_id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_recipient FOREIGN KEY (recipient_id)
    REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  donation_id INT NULL,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('UNREAD','READ') DEFAULT 'UNREAD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
