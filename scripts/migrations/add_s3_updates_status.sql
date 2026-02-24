-- s3_updates 테이블에 status 컬럼 추가 (task_assignments와 동기화)
-- 실행 전: SHOW COLUMNS FROM s3_updates; 로 status 존재 여부 확인

USE flonics_dashboard;

ALTER TABLE s3_updates
  ADD COLUMN status VARCHAR(32) DEFAULT 'pending' NULL
    COMMENT 'task_assignments.status와 동기화: pending, in_progress, on_hold, awaiting_completion, completed',
  ADD INDEX idx_status (status);
