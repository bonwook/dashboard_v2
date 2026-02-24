-- 기존 profiles.role = 'admin' 인 행을 'staff'로 변경 후, ENUM에서 'admin' 제거
-- 신규 설치는 schema.sql 사용 (이미 ENUM이 'client','staff'만 있음)
USE flonics_dashboard;

UPDATE profiles SET role = 'staff' WHERE role = 'admin';

ALTER TABLE profiles MODIFY COLUMN role ENUM('client', 'staff') NOT NULL DEFAULT 'client';
