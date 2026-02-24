-- Report metadata (리포트 폼 속성 정의) + report_info (실제 저장 데이터)
-- 메타데이터: 컬럼 정의만. 정보: task_id, case_id(그룹), form_data(JSON)로 누적.

USE flonics_dashboard;

-- report_metadata: 리포트 폼 컬럼 정의 (속성값만, 실제 데이터 없음)
CREATE TABLE IF NOT EXISTS report_metadata (
  id CHAR(36) PRIMARY KEY,
  field_id VARCHAR(128) NOT NULL UNIQUE COMMENT '필드 식별자 (예: pt_mrn, img_body_part)',
  label VARCHAR(255) NOT NULL COMMENT '표시명',
  field_type VARCHAR(32) NOT NULL DEFAULT 'text' COMMENT 'text, number, date, select, textarea 등',
  section_id VARCHAR(128) NOT NULL DEFAULT '' COMMENT '섹션 그룹 (예: patient_id, imaging)',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '표시 순서',
  is_part_of_key TINYINT(1) NOT NULL DEFAULT 0 COMMENT '복합키 구성 여부 (0/1)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_section_sort (section_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- report_info: 완료된 태스크별 리포트 데이터 (한 행 = 한 태스크, case_id로 그룹 병합 가능)
CREATE TABLE IF NOT EXISTS report_info (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL COMMENT 'task_assignments.id',
  case_id VARCHAR(255) NOT NULL COMMENT '그룹 ID (같은 케이스 = 같은 값, 병합 시 사용)',
  form_data JSON DEFAULT NULL COMMENT '폼 필드 id -> 값 맵',
  uploaded_by CHAR(36) DEFAULT NULL COMMENT '저장한 사용자',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES task_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE KEY uk_report_info_task_id (task_id),
  INDEX idx_case_id (case_id),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
