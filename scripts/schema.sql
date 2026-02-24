-- Flonics Dashboard - Complete Database Schema
-- This is the consolidated schema file containing all required tables
-- Compatible with AWS Aurora MySQL

-- Use database
USE flonics_dashboard;

-- ============================================
-- 1. PROFILES TABLE (User Management)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  organization VARCHAR(255),
  role ENUM('admin', 'client', 'staff') NOT NULL DEFAULT 'client',
  memo TEXT DEFAULT NULL COMMENT 'User notes/memo',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff 가입 대기 요청 (승인 전 저장)
CREATE TABLE IF NOT EXISTS staff_signup_requests (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  organization VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. CASES TABLE (DICOM Data Management)
-- ============================================
CREATE TABLE IF NOT EXISTS cases (
  id CHAR(36) PRIMARY KEY,
  case_number VARCHAR(100) NOT NULL UNIQUE,
  patient_name VARCHAR(255) NOT NULL,
  study_date DATE NOT NULL,
  data_type VARCHAR(255) NOT NULL,
  client_id CHAR(36) NOT NULL,
  client_organization VARCHAR(255),
  dicom_source ENUM('aws_s3', 'email'),
  s3_path TEXT COMMENT 'Legacy field, use file_id instead',
  file_id CHAR(36) DEFAULT NULL COMMENT 'Reference to user_files table',
  status ENUM('registered', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'registered',
  assigned_to CHAR(36),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_case_number (case_number),
  INDEX idx_client_id (client_id),
  INDEX idx_status (status),
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_created_at (created_at),
  INDEX idx_file_id (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. REPORTS TABLE (HTML Report Storage)
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY,
  case_id CHAR(36) NOT NULL,
  report_html LONGTEXT,
  staff_comments TEXT,
  client_comments TEXT,
  report_file_url TEXT COMMENT 'Legacy field, use file_id instead',
  file_id CHAR(36) DEFAULT NULL COMMENT 'Reference to user_files table',
  uploaded_by CHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE RESTRICT,
  INDEX idx_case_id (case_id),
  INDEX idx_uploaded_by (uploaded_by),
  INDEX idx_created_at (created_at),
  INDEX idx_file_id (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. USER FILES TABLE (File Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS user_files (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL COMMENT 'Full S3 path (s3://bucket/key)',
  s3_key VARCHAR(500) NOT NULL COMMENT 'S3 object key',
  s3_bucket VARCHAR(255) NOT NULL,
  file_size BIGINT DEFAULT 0 COMMENT 'File size in bytes',
  content_type VARCHAR(100),
  file_type ENUM('dicom', 'report', 'document', 'image', 'excel', 'pdf', 'other') DEFAULT 'other',
  case_id CHAR(36) DEFAULT NULL COMMENT 'Associated case if applicable',
  report_id CHAR(36) DEFAULT NULL COMMENT 'Associated report if applicable',
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_case_id (case_id),
  INDEX idx_report_id (report_id),
  INDEX idx_file_type (file_type),
  INDEX idx_uploaded_at (uploaded_at),
  INDEX idx_s3_bucket_key (s3_bucket, s3_key(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. BILLING TABLE (Invoice Management)
-- ============================================
CREATE TABLE IF NOT EXISTS billing (
  id CHAR(36) PRIMARY KEY,
  case_id CHAR(36) NOT NULL,
  amount DECIMAL(10, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  status ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
  invoice_date DATE,
  paid_date DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  INDEX idx_case_id (case_id),
  INDEX idx_status (status),
  INDEX idx_invoice_date (invoice_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. AUDIT LOG TABLE (Activity Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id CHAR(36) PRIMARY KEY,
  case_id CHAR(36),
  user_id CHAR(36),
  action VARCHAR(255) NOT NULL,
  details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_case_id (case_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. TASK ASSIGNMENTS TABLE (Task Management)
-- ============================================
CREATE TABLE IF NOT EXISTS task_assignments (
  id CHAR(36) PRIMARY KEY,
  assigned_to CHAR(36) NOT NULL COMMENT 'User who received the task',
  assigned_by CHAR(36) NOT NULL COMMENT 'User who assigned the task',
  title VARCHAR(255) NOT NULL COMMENT 'Task title',
  content LONGTEXT COMMENT 'Task content/body',
  description TEXT COMMENT 'Task description',
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  status ENUM('pending', 'in_progress', 'on_hold', 'awaiting_completion', 'completed') DEFAULT 'pending',
  file_keys JSON COMMENT 'Array of S3 file keys assigned to this task',
  comment LONGTEXT DEFAULT NULL COMMENT 'Comment content for the task',
  comment_file_keys JSON DEFAULT NULL COMMENT 'Array of S3 file keys for comment attachments',
  due_date DATE DEFAULT NULL COMMENT 'Due date for the task',
  is_multi_assign BOOLEAN DEFAULT FALSE COMMENT 'Whether this task has multiple assignees',
  assignment_type ENUM('single', 'individual') DEFAULT 'single' COMMENT 'Assignment type: single or individual',
  download_token VARCHAR(255) DEFAULT NULL COMMENT 'Token for downloading files (valid for 1 week)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL COMMENT 'When task was completed',
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE RESTRICT,
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_assigned_by (assigned_by),
  INDEX idx_status (status),
  INDEX idx_priority (priority),
  INDEX idx_created_at (created_at),
  INDEX idx_completed_at (completed_at),
  INDEX idx_is_multi_assign (is_multi_assign),
  INDEX idx_assignment_type (assignment_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. TASK SUBTASKS TABLE (Multiple Assignees)
-- ============================================
CREATE TABLE IF NOT EXISTS task_subtasks (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL COMMENT 'Reference to parent task_assignments',
  subtitle VARCHAR(255) DEFAULT NULL COMMENT 'Subtitle for this subtask',
  assigned_to CHAR(36) NOT NULL COMMENT 'User who received this subtask',
  content LONGTEXT COMMENT 'Individual content for this assignee',
  file_keys JSON COMMENT 'Array of S3 file keys for this assignee',
  status ENUM('pending', 'in_progress', 'on_hold', 'awaiting_completion', 'completed') DEFAULT 'pending',
  comment LONGTEXT DEFAULT NULL COMMENT 'Comment from assignee',
  comment_file_keys JSON DEFAULT NULL COMMENT 'Array of S3 file keys for comment attachments',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL COMMENT 'When this subtask was completed',
  FOREIGN KEY (task_id) REFERENCES task_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_task_id (task_id),
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_status (status),
  INDEX idx_completed_at (completed_at),
  INDEX idx_task_subtasks_subtitle (subtitle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8.1. TASK FILE ATTACHMENTS (task_id별 첨부파일, 파일별 uploaded_at)
-- ============================================
CREATE TABLE IF NOT EXISTS task_file_attachments (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL COMMENT 'task_assignments.id',
  subtask_id CHAR(36) DEFAULT NULL COMMENT 'task_subtasks.id (담당자 첨부 시 해당 세부업무)',
  s3_key VARCHAR(500) NOT NULL COMMENT 'S3 object key',
  file_name VARCHAR(255) DEFAULT NULL COMMENT '표시용 파일명',
  attachment_type ENUM('requester','assignee') NOT NULL COMMENT '요청자/담당자 첨부',
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '첨부 시점 (파일별 7일 만료 기준)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES task_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (subtask_id) REFERENCES task_subtasks(id) ON DELETE CASCADE,
  INDEX idx_task_id (task_id),
  INDEX idx_subtask_id (subtask_id),
  INDEX idx_s3_key (s3_key(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 9. TASK STATUS HISTORY TABLE (Status Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS task_status_history (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  status ENUM('pending', 'in_progress', 'on_hold', 'awaiting_completion', 'completed') NOT NULL,
  changed_by CHAR(36),
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  FOREIGN KEY (task_id) REFERENCES task_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_task_id (task_id),
  INDEX idx_changed_at (changed_at),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 10. S3 UPDATES TABLE (S3 업로드 알림 → 작업 연동)
-- ============================================
CREATE TABLE IF NOT EXISTS s3_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  bucket_name VARCHAR(100),
  file_size BIGINT,
  upload_time DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  task_id CHAR(36) DEFAULT NULL COMMENT '담당자 지정 후 연결된 task_assignments.id',
  FOREIGN KEY (task_id) REFERENCES task_assignments(id) ON DELETE SET NULL,
  INDEX idx_task_id (task_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
