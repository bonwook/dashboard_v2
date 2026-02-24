-- s3_updates 행이 생성될 때 task_assignments에 placeholder 행 자동 생성 및 s3_updates.task_id/status 연결
-- 전제: profiles 테이블에 최소 1명의 레코드가 있어야 함 (admin 우선, 없으면 아무 1명)
-- 실행 전 add_s3_updates_status.sql 적용 필수 (s3_updates.status 컬럼 필요)
--
-- 1419 에러가 나면: binary logging 환경에서 트리거 제한 때문입니다.
-- DBA가 한 번만 실행 후 원복 가능: SET GLOBAL log_bin_trust_function_creators = 1;
-- 트리거 생성 후: SET GLOBAL log_bin_trust_function_creators = 0;

USE flonics_dashboard;

DROP TRIGGER IF EXISTS after_s3_updates_insert;

DELIMITER $$

CREATE TRIGGER after_s3_updates_insert
AFTER INSERT ON s3_updates
FOR EACH ROW
BEGIN
  DECLARE tid CHAR(36);
  DECLARE aid CHAR(36);
  DECLARE fkeys JSON;
  DECLARE due_val DATE DEFAULT NULL;
  DECLARE h CHAR(32);

  -- 결정적 ID (binary logging 시 UUID() 사용 시 1419 에러 방지)
  SET h = LOWER(MD5(CONCAT('s3up:', NEW.id, ':', IFNULL(NEW.file_name,''), ':', IFNULL(NEW.created_at,''))));
  SET tid = CONCAT(
    SUBSTRING(h, 1, 8), '-', SUBSTRING(h, 9, 4), '-4', SUBSTRING(h, 13, 3), '8', SUBSTRING(h, 16, 3), '-', SUBSTRING(h, 19, 12)
  );

  -- assigned_to, assigned_by용 프로필 1명 (admin 우선, 결정적 복제를 위해 ORDER BY 사용)
  SELECT id INTO aid FROM profiles WHERE role = 'admin' ORDER BY id LIMIT 1;
  IF aid IS NULL THEN
    SELECT id INTO aid FROM profiles ORDER BY id LIMIT 1;
  END IF;

  -- profile이 없으면 트리거 스킵 (외부 키 제약으로 INSERT 실패 방지)
  IF aid IS NOT NULL THEN
    -- file_keys: S3 키 1개 (bucket_name/file_name 또는 file_name)
    SET fkeys = JSON_ARRAY(
      CONCAT(
        IF(CHAR_LENGTH(TRIM(IFNULL(NEW.bucket_name, ''))) > 0, CONCAT(TRIM(NEW.bucket_name), '/'), ''),
        NEW.file_name
      )
    );
    SET due_val = IFNULL(DATE(NEW.upload_time), DATE(NEW.created_at));

    INSERT INTO task_assignments (
      id, assigned_to, assigned_by, title, content, priority, status,
      file_keys, is_multi_assign, assignment_type, due_date, created_at, updated_at
    ) VALUES (
      tid, aid, aid, '(미할당)', '', 'medium', 'pending',
      fkeys, FALSE, 'single', due_val,
      COALESCE(NEW.upload_time, NEW.created_at),
      COALESCE(NEW.upload_time, NEW.created_at)
    );

    -- task_id 연결. status 컬럼이 있으면 동기화 (add_s3_updates_status.sql 적용 후 실행할 것)
    UPDATE s3_updates SET task_id = tid, status = 'pending' WHERE id = NEW.id;
  END IF;
END$$

DELIMITER ;
