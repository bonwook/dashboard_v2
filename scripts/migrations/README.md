# Database Migrations

이 폴더에는 데이터베이스 스키마 변경을 위한 마이그레이션 스크립트가 포함되어 있습니다.

## 마이그레이션 실행 방법

### 1. add_s3_key_column.sql

S3 파일의 실제 키를 저장하기 위한 `s3_key` 컬럼을 추가합니다.

**문제**: `file_name`을 변경하면 다운로드가 실패하는 문제
**해결**: 실제 S3 키를 별도로 저장하여 표시용 이름과 분리

```bash
# MySQL에 접속
mysql -u your_username -p -h your_host flonics_dashboard

# 또는 AWS RDS의 경우
mysql -u admin -p -h your-rds-endpoint.region.rds.amazonaws.com flonics_dashboard

# 마이그레이션 실행
source /path/to/dashboard_v2/scripts/migrations/add_s3_key_column.sql
```

**또는 파일을 직접 실행:**

```bash
mysql -u your_username -p -h your_host flonics_dashboard < scripts/migrations/add_s3_key_column.sql
```

### 실행 후 확인

```sql
-- 컬럼이 추가되었는지 확인
DESCRIBE s3_updates;

-- 데이터가 복사되었는지 확인
SELECT id, file_name, s3_key FROM s3_updates LIMIT 10;
```

## 주의사항

- 마이그레이션은 한 번만 실행하면 됩니다
- 기존 데이터의 `file_name` 값이 `s3_key`로 복사됩니다
- 이후부터는 `file_name`을 변경해도 다운로드가 정상적으로 작동합니다
