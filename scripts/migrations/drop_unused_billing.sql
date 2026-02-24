-- 사용하지 않는 billing 테이블 제거 (앱 코드에서 참조 없음)
USE flonics_dashboard;

DROP TABLE IF EXISTS billing;
