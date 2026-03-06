# 데이터베이스 설계

## 목차

- [1. 개요](#1-개요)
- [2. 테이블 관계도 (ERD)](#2-테이블-관계도-erd)
- [3. 테이블 상세](#3-테이블-상세)
- [4. 인덱스 전략](#4-인덱스-전략)
- [5. 마이그레이션](#5-마이그레이션)
- [6. 연결 설정](#6-연결-설정)

---

## 1. 개요

- **엔진**: AWS Aurora MySQL (MySQL 8.0 호환)
- **엔드포인트**: `<your-cluster>.cluster-xxxx.ap-northeast-2.rds.amazonaws.com`
- **리전**: ap-northeast-2 (서울)
- **데이터베이스명**: `<your_database_name>`
- **문자 인코딩**: `utf8mb4` / `utf8mb4_unicode_ci` (다국어 환자명, 이모지 지원)
- **스토리지 엔진**: InnoDB (트랜잭션, 외래 키 제약 지원)
- **테이블 수**: 총 16개 (schema.sql 15개 + task_comments API 생성)

스키마 전체 정의: `scripts/schema.sql`
점진적 마이그레이션: `scripts/migrations/` 디렉토리

---

## 2. 테이블 관계도 (ERD)

```
profiles (사용자)
    │
    ├──< cases (의료 케이스)
    │       └──< reports (분석 리포트)
    │
    ├──< user_files (파일 추적)
    │
    ├──< billing (청구)
    │
    ├──< task_assignments (업무 배정)  ←── s3_updates (S3 이벤트 알림)
    │       ├──< task_subtasks (세부업무)
    │       ├──< task_file_attachments (첨부파일·7일 만료)
    │       ├──< task_status_history (상태 이력)
    │       └──< task_comments (댓글)
    │
    ├──< spreadsheet_folders (스프레드시트 폴더)
    │       └──< spreadsheet_files (스프레드시트 파일)
    │               └──< spreadsheet_rows (행 데이터)
    │
    └──< audit_log (감사 로그)
```

---

## 3. 테이블 상세

### `profiles` — 사용자

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `email` | VARCHAR(255) UNIQUE | 로그인 이메일 |
| `password_hash` | VARCHAR(255) | bcryptjs cost 10 해시 |
| `full_name` | VARCHAR(255) | 표시명 |
| `organization` | VARCHAR(255) | 소속 기관 |
| `role` | ENUM('client','staff') | 사용자 역할 |
| `memo` | TEXT | 관리자 메모 |
| `created_at` | DATETIME | 가입 일시 |
| `updated_at` | DATETIME | 마지막 수정 일시 |

### `staff_signup_requests` — Staff 가입 대기

Staff 가입 시 즉시 `profiles`에 삽입되지 않고 이 테이블에 저장됩니다. 기존 Staff 승인 후 `profiles`로 이전됩니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `email` | VARCHAR(255) | 신청 이메일 |
| `password_hash` | VARCHAR(255) | 승인 시 그대로 이전 |
| `full_name` | VARCHAR(255) | 이름 |
| `organization` | VARCHAR(255) | 소속 |
| `created_at` | DATETIME | 신청 일시 |

### `cases` — 의료 케이스

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `case_number` | VARCHAR(100) UNIQUE | 케이스 고유 번호 |
| `patient_name` | VARCHAR(255) | 환자명 (PHI) |
| `study_date` | DATE | 검사일 (PHI) |
| `data_type` | VARCHAR(255) | 데이터 유형 |
| `client_id` | CHAR(36) FK | 의뢰 Client |
| `client_organization` | VARCHAR(255) | 의뢰 기관명 |
| `file_id` | CHAR(36) FK | `user_files` 참조 |
| `status` | ENUM | registered/processing/completed/failed |
| `assigned_to` | CHAR(36) FK | 담당 Staff |
| `notes` | TEXT | 케이스 메모 |

### `reports` — 분석 리포트

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `case_id` | CHAR(36) FK | 케이스 참조 (CASCADE DELETE) |
| `report_html` | LONGTEXT | HTML 리포트 본문 |
| `staff_comments` | TEXT | Staff 코멘트 |
| `client_comments` | TEXT | Client 코멘트 |
| `file_id` | CHAR(36) FK | 리포트 파일 (`user_files`) |
| `uploaded_by` | CHAR(36) FK | 생성한 Staff |
| `created_at` | DATETIME | 생성 일시 |

### `user_files` — 파일 추적

S3에 업로드된 모든 파일의 메타데이터를 추적합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `user_id` | CHAR(36) FK | 업로드한 사용자 |
| `file_name` | VARCHAR(255) | 표시 파일명 |
| `s3_key` | VARCHAR(500) | S3 오브젝트 키 |
| `s3_bucket` | VARCHAR(255) | S3 버킷명 |
| `file_size` | BIGINT | 파일 크기 (bytes) |
| `content_type` | VARCHAR(100) | MIME 타입 |
| `file_type` | ENUM | dicom/report/document/image/excel/pdf/other |
| `case_id` | CHAR(36) FK | 연관 케이스 (선택) |
| `report_id` | CHAR(36) FK | 연관 리포트 (선택) |
| `uploaded_at` | DATETIME | 업로드 일시 |

### `billing` — 청구

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `case_id` | CHAR(36) FK | 케이스 참조 |
| `amount` | DECIMAL(10,2) | 청구 금액 |
| `currency` | VARCHAR(10) | 통화 (기본 USD) |
| `status` | ENUM | pending/paid/cancelled |
| `invoice_date` | DATE | 청구일 |
| `paid_date` | DATE | 납부일 |

### `audit_log` — 감사 로그

모든 주요 액션이 영구 보존됩니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `case_id` | CHAR(36) FK | 연관 케이스 (선택) |
| `user_id` | CHAR(36) FK | 액션 수행자 |
| `action` | VARCHAR(255) | 액션명 (예: `file.upload`) |
| `details` | JSON | 액션 상세 정보 |
| `created_at` | DATETIME | 기록 일시 |

### `task_assignments` — 업무 배정

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `assigned_to` | CHAR(36) FK | 담당 Client |
| `assigned_by` | CHAR(36) FK | 배정한 Staff |
| `title` | VARCHAR(255) | 업무 제목 |
| `content` | LONGTEXT | 업무 내용 |
| `priority` | ENUM | low/medium/high/urgent |
| `status` | ENUM | pending/in_progress/on_hold/awaiting_completion/completed |
| `file_keys` | JSON | 요청자 첨부 S3 키 배열 |
| `comment_file_keys` | JSON | 담당자 첨부 S3 키 배열 |
| `due_date` | DATE | 마감일 |
| `is_multi_assign` | BOOLEAN | 다중 담당자 여부 |
| `assignment_type` | ENUM | single/individual |
| `completed_at` | DATETIME | 완료 일시 |

### `task_subtasks` — 세부업무

`is_multi_assign=true`인 업무에서 담당자별 개별 업무를 관리합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `task_id` | CHAR(36) FK | 상위 업무 (CASCADE DELETE) |
| `subtitle` | VARCHAR(255) | 세부업무 제목 |
| `assigned_to` | CHAR(36) FK | 담당자 |
| `file_keys` | JSON | 담당자별 첨부 파일 |
| `status` | ENUM | 상위 업무와 동일 |
| `completed_at` | DATETIME | 완료 일시 |

### `task_file_attachments` — 업무 첨부파일

파일별 만료(7일) 계산을 위해 행 단위로 관리합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `task_id` | CHAR(36) FK | 업무 참조 |
| `subtask_id` | CHAR(36) FK | 세부업무 참조 (선택) |
| `s3_key` | VARCHAR(500) | S3 오브젝트 키 |
| `file_name` | VARCHAR(255) | 표시 파일명 |
| `attachment_type` | ENUM | requester/assignee |
| `uploaded_at` | DATETIME | **파일별 7일 만료 기준** |

### `task_status_history` — 업무 상태 이력

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `task_id` | CHAR(36) FK | 업무 참조 |
| `status` | ENUM | 변경된 상태 |
| `changed_by` | CHAR(36) FK | 변경한 사용자 |
| `changed_at` | DATETIME | 변경 일시 |
| `notes` | TEXT | 변경 메모 |

### `task_comments` — 업무 댓글

API 초기화 시 `CREATE TABLE IF NOT EXISTS`로 생성됩니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID |
| `task_id` | CHAR(36) FK | 업무 참조 |
| `user_id` | CHAR(36) FK | 작성자 |
| `content` | TEXT | 댓글 내용 |
| `created_at` | DATETIME | 작성 일시 |

### `s3_updates` — S3 이벤트 알림

외부 시스템(Lambda 등)이 S3에 파일 업로드 시 이 테이블에 알림을 삽입합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT AUTO_INCREMENT PK | — |
| `file_name` | VARCHAR(255) | 파일명 |
| `s3_key` | VARCHAR(500) | S3 오브젝트 키 |
| `bucket_name` | VARCHAR(100) | 버킷명 |
| `file_size` | BIGINT | 파일 크기 |
| `metadata` | JSON | DICOM 비PII 태그 (PatientName 등 PHI 제외) |
| `upload_time` | DATETIME | 업로드 일시 |
| `task_id` | CHAR(36) FK | 담당자 배정 후 연결된 task_assignments.id |
| `note` | TEXT | Admin 메모 |

### 스프레드시트

인앱 데이터 관리용 스프레드시트 기능입니다.

| 테이블 | 설명 |
|--------|------|
| `spreadsheet_folders` | 폴더 계층 구조 (parent_id로 중첩) |
| `spreadsheet_files` | 스프레드시트 파일 (headers: JSON 배열) |
| `spreadsheet_rows` | 행 데이터 (row_data: JSON, file_id+row_index UNIQUE) |

---

## 4. 인덱스 전략

| 테이블 | 주요 인덱스 | 용도 |
|--------|-----------|------|
| `profiles` | `idx_email`, `idx_role` | 로그인, 역할별 목록 조회 |
| `cases` | `idx_case_number`, `idx_client_id`, `idx_status`, `idx_assigned_to` | 케이스 검색·필터 |
| `task_assignments` | `idx_assigned_to`, `idx_assigned_by`, `idx_status`, `idx_completed_at` | 업무 목록·캘린더 조회 |
| `task_subtasks` | `idx_task_id`, `idx_assigned_to` | 세부업무 조회 |
| `task_file_attachments` | `idx_task_id`, `idx_s3_key` | 첨부파일·만료 계산 |
| `audit_log` | `idx_user_id`, `idx_action`, `idx_created_at` | 감사 이력 조회 |
| `s3_updates` | `idx_task_id`, `idx_created_at` | 미처리 알림 조회 |
| `user_files` | `idx_user_id`, `idx_s3_bucket_key` | 파일 소유권 검증 |

---

## 5. 마이그레이션

### 신규 설치

```bash
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME < scripts/schema.sql
```

`CREATE TABLE IF NOT EXISTS`를 사용하므로 기존 테이블에 영향을 주지 않습니다.

### 점진적 마이그레이션

`scripts/migrations/` 폴더의 파일을 날짜 순으로 적용합니다.

```bash
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME < scripts/migrations/YYYYMMDD_설명.sql
```

> 마이그레이션 실행 전 반드시 Aurora 스냅샷(백업)을 생성하십시오.

---

## 6. 연결 설정

구현 파일: `lib/database/mysql.ts`

| 설정 | 값 | 설명 |
|------|-----|------|
| `connectionLimit` | 10 | 최대 동시 커넥션 수 |
| `waitForConnections` | true | 풀 소진 시 큐 대기 |
| `idleTimeout` | 60000ms | 유휴 커넥션 해제 시간 |
| 비밀번호 소스 | AWS Secrets Manager | `AWS_DB_SECRET_NAME` 또는 `DB_SECRET_ARN` 필수 |
| 자동 복구 | ER_ACCESS_DENIED_ERROR 시 Secrets Manager 재조회 후 재시도 | 비밀번호 자동 로테이션 대응 |

> **db.t4g.small 기준 최대 커넥션**: ~90개 (`45 × RAM(GiB)`)
> 현재 풀 크기(10)는 권장 범위(10–20개) 내에 있습니다.
