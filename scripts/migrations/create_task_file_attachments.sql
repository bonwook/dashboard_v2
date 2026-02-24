-- task_id별 첨부파일을 행 단위로 관리 (파일별 uploaded_at으로 7일 만료 안정 계산)
-- requester: 요청자 첨부, assignee: 담당자 첨부. subtask_id 있으면 해당 세부업무 담당자 첨부.

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
