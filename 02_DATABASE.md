# 데이터베이스 설계

## 목차

- [1. 개요](#1-개요)
- [2. 테이블 관계도 (ERD)](#2-테이블-관계도-erd)
- [3. 테이블 상세](#3-테이블-상세)
  - [profiles](#profiles--사용자)
  - [staff_signup_requests](#staff_signup_requests--스태프-가입-대기)
  - [cases](#cases--의료-케이스)
  - [reports](#reports--분석-리포트)
  - [report_info](#report_info--리포트-폼-데이터)
  - [report_metadata](#report_metadata--리포트-메타데이터)
  - [user_files](#user_files--파일-추적)
  - [audit_log](#audit_log--감사-로그)
  - [task_assignments](#task_assignments--업무-배정)
  - [task_subtasks](#task_subtasks--세부-업무)
  - [task_file_attachments](#task_file_attachments--업무-첨부파일)
  - [task_status_history](#task_status_history--업무-상태-이력)
  - [s3_updates](#s3_updates--s3-이벤트-알림)
  - [spreadsheet_folders / spreadsheet_files / spreadsheet_rows](#스프레드시트)
  - [task_comments](#task_comments--업무-댓글)
- [4. 인덱스 전략](#4-인덱스-전략)
- [5. 마이그레이션](#5-마이그레이션)
- [6. 연결 설정](#6-연결-설정)

---

## 1. 개요

- **엔진**: AWS Aurora MySQL (MySQL 8.0 호환)
- **엔드포인트**: `flonics-dashboard.cfi0kamg421b.ap-northeast-2.rds.amazonaws.com`
- **리전**: ap-northeast-2 (서울)
- **데이터베이스명**: `flonics_dashboard`
- **문자 인코딩**: `utf8mb4` / `utf8mb4_unicode_ci` (다국어 환자명, 이모지 지원)
- **스토리지 엔진**: InnoDB (트랜잭션, 외래 키 제약 지원)
- **테이블 수**: 총 17개

스키마 전체 정의: `scripts/schema.sql`  
점진적 마이그레이션: `scripts/migrations/` 디렉토리

---

## 2. 테이블 관계도 (ERD)

```
profiles (사용자)
    │
    ├──< cases (의료 케이스)
    │       │
    │       ├──< reports (분석 리포트)
    │       │       └── user_files (파일 참조)
    │       │
    │       └──< user_files (업로드 파일)
    │
    ├──< task_assignments (업무 배정)  ←── s3_updates (S3 이벤트)
    │       │
    │       ├──< task_subtasks (세부 업무)
    │       │       └──< task_file_attachments (첨부파일)
    │       │
    │       ├──< task_file_attachments (첨부파일)
    │       ├──< task_status_history (상태 이력)
    │       ├──< task_comments (댓글)
    │       └──< report_info (리포트 폼 데이터)
    │
    ├──< audit_log (감사 로그)
    ├──< staff_signup_requests (가입 대기)
    └──< spreadsheet_folders / spreadsheet_files / spreadsheet_rows

report_metadata (리포트 필드 정의 — 독립 테이블, FK 없음)
```

---

## 3. 테이블 상세

### `profiles` — 사용자

모든 사용자(client, staff)의 계정 정보를 저장합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `email` | VARCHAR(255) UNIQUE | 로그인 이메일 |
| `password_hash` | VARCHAR(255) | bcryptjs cost factor 10 해시 |
| `full_name` | VARCHAR(255) | 표시명 |
| `organization` | VARCHAR(255) | 소속 기관 |
| `role` | ENUM('client','staff') | 사용자 역할 |
| `memo` | TEXT | 관리자 메모 |
| `created_at` | DATETIME | 가입 시각 |
| `updated_at` | DATETIME | 최종 수정 시각 (ON UPDATE) |

**인덱스**: `idx_email`, `idx_role`

> `role`이 `staff`인 사용자는 `staff_signup_requests`를 거쳐 Admin 승인 후 이 테이블에 삽입됩니다.

---

### `staff_signup_requests` — 스태프 가입 대기

Staff 회원가입 요청을 임시 저장합니다. Admin 승인 시 `profiles`로 이전되고 이 행은 삭제됩니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `email` | VARCHAR(255) | 요청 이메일 |
| `password_hash` | VARCHAR(255) | bcryptjs 해시 |
| `full_name` | VARCHAR(255) | 이름 |
| `organization` | VARCHAR(255) | 소속 기관 |
| `created_at` | DATETIME | 요청 시각 |

**승인 API**: `POST /api/notifications/pending-staff/[id]/approve`  
**거절 API**: `POST /api/notifications/pending-staff/[id]/reject`

---

### `cases` — 의료 케이스

DICOM/NIfTI 데이터의 분석 케이스를 나타냅니다. 환자명(`patient_name`)과 검사일(`study_date`)이 포함된 개인 식별 정보(PHI) 필드가 존재하므로 접근 시 반드시 인증·인가 검증이 필요합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `case_number` | VARCHAR(100) UNIQUE | 케이스 고유 번호 |
| `patient_name` | VARCHAR(255) | 환자명 ⚠️ PHI |
| `study_date` | DATE | 검사일 ⚠️ PHI |
| `data_type` | VARCHAR(255) | 데이터 종류 (예: 4D Flow MRI) |
| `client_id` | CHAR(36) FK→profiles | 케이스 제출 클라이언트 |
| `client_organization` | VARCHAR(255) | 클라이언트 소속 기관 |
| `dicom_source` | ENUM('aws_s3','email') | 원본 파일 수신 경로 |
| `s3_path` | TEXT | ⚠️ Deprecated — `file_id` 사용 권장 |
| `file_id` | CHAR(36) → user_files | 연결된 파일 ID |
| `status` | ENUM('registered','processing','completed','failed') | 처리 상태 |
| `assigned_to` | CHAR(36) FK→profiles | 담당 스태프 |
| `notes` | TEXT | 케이스 메모 |
| `created_at` | DATETIME | 등록 시각 |
| `updated_at` | DATETIME | 최종 수정 시각 |

**인덱스**: `idx_case_number`, `idx_client_id`, `idx_status`, `idx_assigned_to`, `idx_created_at`, `idx_file_id`

---

### `reports` — 분석 리포트

케이스별 분석 완료 리포트를 저장합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `case_id` | CHAR(36) FK→cases | 연결 케이스 (CASCADE DELETE) |
| `report_html` | LONGTEXT | HTML 형식 리포트 본문 |
| `staff_comments` | TEXT | 스태프 코멘트 |
| `client_comments` | TEXT | 클라이언트 코멘트 |
| `report_file_url` | TEXT | ⚠️ Deprecated — `file_id` 사용 권장 |
| `file_id` | CHAR(36) → user_files | 파일로 저장된 리포트 |
| `uploaded_by` | CHAR(36) FK→profiles | 리포트 생성 스태프 |
| `created_at` | DATETIME | 생성 시각 |

---

### `report_info` — 리포트 폼 데이터

업무(`task_assignments`)와 연결된 리포트의 구조화된 폼 데이터를 저장합니다. 같은 `task_id`로 upsert(있으면 UPDATE, 없으면 INSERT)됩니다.

API: `GET/POST /api/reports/info`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `task_id` | CHAR(36) NOT NULL | 연결 업무 ID (`task_assignments.id`) |
| `case_id` | CHAR(36) | 연결 케이스 ID (없으면 task_id 동일 값 사용) |
| `form_data` | JSON | 리포트 폼 필드 데이터 (key-value JSON) |
| `uploaded_by` | CHAR(36) FK→profiles | 작성 Staff (SET NULL on delete) |
| `created_at` | DATETIME | 최초 생성 시각 |
| `updated_at` | DATETIME | 최종 수정 시각 (ON UPDATE) |

**인덱스**: `idx_task_id`, `idx_case_id`

**특이사항**:
- Staff 전용 (`role=staff`만 접근 가능)
- `GET /api/reports/pending`에서 `report_info`와 `reports` 테이블을 LEFT JOIN하여 리포트 미작성 업무 목록 산출

---

### `report_metadata` — 리포트 메타데이터

리포트 폼의 필드 정의를 저장합니다. `report_info.form_data`의 각 키가 어떤 타입·레이블·섹션을 갖는지 명세하는 메타 테이블입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `field_id` | VARCHAR(255) NOT NULL | 폼 필드 고유 식별자 (`form_data`의 key와 매핑) |
| `label` | VARCHAR(255) NOT NULL | 필드 표시명 |
| `field_type` | VARCHAR(100) NOT NULL | 필드 타입 (예: text, number, select 등) |
| `section_id` | VARCHAR(255) | 섹션 그룹 식별자 |
| `sort_order` | INT | 섹션 내 정렬 순서 (기본값: 0) |
| `is_part_of_key` | TINYINT(1) | 리포트 핵심 식별 필드 여부 (0/1) |
| `created_at` | DATETIME | 생성 시각 |

**인덱스**: `idx_section_id`, `idx_sort_order`

---

### `user_files` — 파일 추적

S3에 업로드된 모든 파일의 메타데이터를 추적합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `user_id` | CHAR(36) FK→profiles | 업로드한 사용자 (CASCADE DELETE) |
| `file_name` | VARCHAR(255) | 표시 파일명 |
| `file_path` | TEXT | 전체 S3 경로 (`s3://bucket/key`) |
| `s3_key` | VARCHAR(500) | S3 오브젝트 키 |
| `s3_bucket` | VARCHAR(255) | S3 버킷명 |
| `file_size` | BIGINT | 파일 크기 (bytes) |
| `content_type` | VARCHAR(100) | MIME 타입 |
| `file_type` | ENUM('dicom','report','document','image','excel','pdf','other') | 파일 분류 |
| `case_id` | CHAR(36) → cases | 연결 케이스 (nullable) |
| `report_id` | CHAR(36) → reports | 연결 리포트 (nullable) |
| `uploaded_at` | DATETIME | 업로드 시각 (파일 만료 계산 기준) |
| `updated_at` | DATETIME | 최종 수정 시각 |

**인덱스**: `idx_user_id`, `idx_case_id`, `idx_report_id`, `idx_file_type`, `idx_uploaded_at`, 복합인덱스 `idx_s3_bucket_key`

---

### `audit_log` — 감사 로그

시스템 내 모든 중요 액션의 이력을 기록합니다. 의료 데이터 처리 투명성 확보 및 규제 감사 대응용입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `case_id` | CHAR(36) → cases | 관련 케이스 (nullable, SET NULL on delete) |
| `user_id` | CHAR(36) → profiles | 액션 수행 사용자 (SET NULL on delete) |
| `action` | VARCHAR(255) | 액션명 (예: `file_upload`, `task_status_change`) |
| `details` | JSON | 액션 상세 정보 |
| `created_at` | DATETIME | 기록 시각 |

> `writeAuditLog()` 함수(`lib/db/audit.ts`)가 best-effort 방식으로 기록합니다. 감사 로그 기록 실패는 주 요청을 차단하지 않습니다.

---

### `task_assignments` — 업무 배정

스태프에게 배정된 분석 업무의 주 테이블입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `assigned_to` | CHAR(36) FK→profiles | 담당 스태프 (CASCADE DELETE) |
| `assigned_by` | CHAR(36) FK→profiles | 배정한 사용자 (RESTRICT) |
| `title` | VARCHAR(255) | 업무 제목 |
| `content` | LONGTEXT | 업무 본문 |
| `description` | TEXT | 업무 요약 설명 |
| `priority` | ENUM('low','medium','high','urgent') | 우선순위 |
| `status` | ENUM('pending','in_progress','on_hold','awaiting_completion','completed') | 진행 상태 |
| `file_keys` | JSON | 요청자가 첨부한 S3 파일 키 배열 |
| `comment` | LONGTEXT | 담당자 코멘트 |
| `comment_file_keys` | JSON | 담당자 코멘트 첨부 파일 키 배열 |
| `due_date` | DATE | 마감일 |
| `is_multi_assign` | BOOLEAN | 다중 담당자 여부 |
| `assignment_type` | ENUM('single','individual') | 배정 방식 |
| `download_token` | VARCHAR(255) | 파일 다운로드 토큰 (1주 유효) |
| `created_at` | DATETIME | 생성 시각 |
| `updated_at` | DATETIME | 최종 수정 시각 |
| `completed_at` | DATETIME | 완료 시각 |

---

### `task_subtasks` — 세부 업무

`is_multi_assign=true`인 업무에서 담당자별 독립 세부업무를 관리합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `task_id` | CHAR(36) FK→task_assignments | 부모 업무 (CASCADE DELETE) |
| `subtitle` | VARCHAR(255) | 세부업무 제목 |
| `assigned_to` | CHAR(36) FK→profiles | 담당 스태프 |
| `content` | LONGTEXT | 세부업무 내용 |
| `file_keys` | JSON | 첨부 파일 키 배열 |
| `status` | ENUM(task_assignments와 동일) | 진행 상태 |
| `comment` | LONGTEXT | 담당자 코멘트 |
| `comment_file_keys` | JSON | 코멘트 첨부 파일 키 배열 |
| `completed_at` | DATETIME | 완료 시각 |

---

### `task_file_attachments` — 업무 첨부파일

업무 또는 세부업무의 첨부파일을 행 단위로 관리합니다. `uploaded_at`을 기준으로 **파일별 7일 만료** 를 계산합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `task_id` | CHAR(36) FK→task_assignments | 부모 업무 (CASCADE DELETE) |
| `subtask_id` | CHAR(36) FK→task_subtasks | 세부업무 (nullable, CASCADE DELETE) |
| `s3_key` | VARCHAR(500) | S3 오브젝트 키 |
| `file_name` | VARCHAR(255) | 표시용 파일명 |
| `attachment_type` | ENUM('requester','assignee') | 첨부 주체 (요청자/담당자) |
| `uploaded_at` | DATETIME | 첨부 시점 — **7일 만료 계산 기준** |

**만료 로직**: `uploaded_at + 7일` 이 현재 시각보다 이전이면 파일이 만료되었음을 UI에 표시. 실제 S3 객체 삭제는 별도 정책으로 관리.

---

### `task_status_history` — 업무 상태 이력

업무 상태가 변경될 때마다 이력을 영구 보존합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `task_id` | CHAR(36) FK→task_assignments | 부모 업무 |
| `status` | ENUM(task_assignments와 동일) | 변경된 상태 |
| `changed_by` | CHAR(36) → profiles | 변경한 사용자 |
| `changed_at` | DATETIME | 변경 시각 |
| `notes` | TEXT | 변경 사유 메모 |

---

### `s3_updates` — S3 이벤트 알림

외부 시스템(Lambda 등)이 S3 버킷에 파일을 업로드할 때 생성되는 알림 행입니다. Admin이 담당자를 지정하면 `task_assignments`와 연결됩니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT AUTO_INCREMENT PK | |
| `file_name` | VARCHAR(255) | 업로드된 파일명 |
| `s3_key` | VARCHAR(500) | S3 오브젝트 키 |
| `bucket_name` | VARCHAR(100) | S3 버킷명 |
| `file_size` | BIGINT | 파일 크기 (bytes) |
| `metadata` | JSON | DICOM/NIfTI 비PII 태그 (Lambda가 채움) |
| `upload_time` | DATETIME | S3 업로드 시각 |
| `task_id` | CHAR(36) → task_assignments | 담당자 지정 후 연결된 업무 ID |
| `note` | TEXT | Admin 메모 |

---

### 스프레드시트

인앱 스프레드시트 기능을 위한 3개 테이블입니다.

| 테이블 | 설명 |
|--------|------|
| `spreadsheet_folders` | 폴더 계층 구조 (parent_id로 재귀) |
| `spreadsheet_files` | 스프레드시트 파일 (헤더 컬럼 JSON 저장) |
| `spreadsheet_rows` | 행 데이터 (JSON 오브젝트, file_id+row_index UNIQUE) |

---

### `task_comments` — 업무 댓글

업무 또는 세부업무에 달린 댓글을 저장합니다. `app/api/tasks/[id]/comments/route.ts` 최초 호출 시 `CREATE TABLE IF NOT EXISTS`로 자동 생성됩니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | CHAR(36) PK | UUID v4 |
| `task_id` | CHAR(36) NOT NULL | 부모 업무 또는 세부업무 ID (FK 제약 없음 — 메인/서브 통합) |
| `user_id` | CHAR(36) → profiles | 댓글 작성자 (SET NULL on delete) |
| `content` | TEXT | 댓글 내용 |
| `created_at` | DATETIME | 작성 시각 |

**인덱스**: `idx_task_comments_task_id`, `idx_task_comments_created_at`

> `task_id`는 `task_assignments.id` 또는 `task_subtasks.id` 모두 참조 가능하므로 FK 제약 없이 운용합니다.

---

## 4. 인덱스 전략

| 패턴 | 적용된 인덱스 |
|------|--------------|
| 사용자별 케이스 조회 | `cases.idx_client_id` |
| 상태별 케이스 필터링 | `cases.idx_status` |
| 담당자별 업무 조회 | `task_assignments.idx_assigned_to` |
| 만료 파일 조회 | `task_file_attachments` → `uploaded_at` 기준 쿼리 |
| S3 키 중복 검사 | `user_files.idx_s3_bucket_key` (복합) |
| 감사 로그 시간순 조회 | `audit_log.idx_created_at` |

---

## 5. 마이그레이션

### 초기 설치

```bash
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < scripts/schema.sql
```

### 점진적 마이그레이션

`scripts/migrations/` 디렉토리의 파일을 **파일명 날짜 순**으로 실행합니다:

```bash
# 예시
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < scripts/migrations/create_task_file_attachments.sql
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < scripts/migrations/add_s3_updates_task_id.sql
```

> 마이그레이션 실행 전 반드시 DB 백업을 수행하십시오.

### 새 마이그레이션 작성 규칙

```
scripts/migrations/YYYYMMDD_<설명>.sql
```

파일 내 `IF NOT EXISTS` / `IF EXISTS` 조건을 사용하여 멱등성(idempotent)을 보장하십시오.

---

## 6. 연결 설정

DB 연결은 `lib/database/mysql.ts`에서 커넥션 풀로 관리됩니다.

- **비밀번호 우선순위**: `AWS_DB_SECRET_NAME` 환경 변수가 설정된 경우 AWS Secrets Manager에서 동적으로 조회. 없으면 `.env`의 `DB_PASSWORD` 사용.
- **자동 복구**: `ER_ACCESS_DENIED_ERROR` 발생 시 Secrets Manager에서 최신 비밀번호를 재조회하고 커넥션 풀을 재생성합니다. (비밀번호 로테이션 무중단 대응)

자세한 내용은 [`docs/04_AWS_INFRASTRUCTURE.md#aurora-mysql-및-secrets-manager`](04_AWS_INFRASTRUCTURE.md#aurora-mysql-및-secrets-manager)를 참조하십시오.
