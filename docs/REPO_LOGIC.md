# Flonics Dashboard — 전체 레포 로직

Next.js(App Router) 기반 4D Flow MRI 분석 대시보드. 인증·업무·케이스·리포트·파일(S3) 관리를 하나의 앱에서 처리한다.

---

## 1. 프로젝트 구조

```
flonics_Dashboard/
├── app/
│   ├── api/                    # REST API (인증: auth-token 쿠키)
│   │   ├── auth/               # signin, signup, signout, me
│   │   ├── tasks/              # 업무 CRUD, 댓글, 세부업무, 캘린더, 리포트 연동
│   │   ├── storage/            # 업로드, 다운로드, presigned URL, resolve-file-keys, assign, delete
│   │   ├── s3-updates/         # S3 업로드 알림 목록·단건·presigned-url (admin/staff)
│   │   ├── reports/            # 리포트 목록·생성·export
│   │   ├── profiles/           # 프로필 목록·역할 수정 (admin/staff)
│   │   ├── notifications/     # Staff 가입 대기·승인/거절
│   │   ├── analytics/          # 대시보드 통계 (admin/staff)
│   │   ├── holidays/           # 공휴일 API
│   │   └── excel/              # 엑셀 파싱
│   ├── admin/                  # 관리자/스태프 전용 페이지 (cases, calendar, reports, analytics, users, settings 등)
│   ├── client/                 # 클라이언트 페이지 (진행현황, 리포트, 업로드, 마스킹, 엑셀, analytics)
│   └── auth/                   # 로그인, 회원가입
├── lib/
│   ├── database/               # mysql.ts(연결풀·query·queryOne), auth.ts(verifyToken·getUserById)
│   ├── db/                     # mysql·audit 재export
│   ├── auth/                   # getCurrentUser, requireAuth, requireRole (cookies + verifyToken)
│   ├── aws/                    # S3 클라이언트, secrets(DB 비밀번호 등)
│   ├── utils/                  # fileKeyHelpers, dateHelpers, s3Updates(toS3Key), fetch, sanitize 등
│   ├── archive/                # zip/7z 압축 해제
│   └── hooks/                  # useTasks, useCalendar, useTaskData 등
├── components/                 # UI 컴포넌트 (masking, task, ui 등)
└── scripts/                    # schema.sql, migrations/*.sql, 테스트 스크립트
```

---

## 2. 인증·권한

- **인증**: JWT를 `auth-token` 쿠키에 저장. API는 `verifyToken(token)`으로 검증 후 `decoded.id`(및 `decoded.role`) 사용.
- **역할**: `profiles.role` — `admin`, `staff`, `client`.
  - **admin/staff**: 모든 업무·케이스·리포트·S3 업데이트·프로필 조회/수정, Staff 가입 승인/거절, analytics.
  - **client**: 자신이 할당된 업무·케이스·리포트, 본인 파일만 resolve 등 제한.
- **회원가입**: `auth/signup` — client·staff만 가입 가능. staff는 `staff_signup_requests`에 저장 후 admin/staff 승인 시 `profiles`로 이전.

---

## 3. 데이터베이스 (MySQL / Aurora)

- **연결**: `lib/database/mysql.ts` — `getPool()`, `query()`, `queryOne()`. 비밀번호는 env 또는 AWS Secrets Manager(`lib/aws/secrets.ts`).
- **주요 테이블**:
  - **profiles**: 사용자 (id, email, password_hash, role, full_name, organization 등).
  - **staff_signup_requests**: Staff 가입 대기.
  - **cases**: 케이스( case_number, patient_name, study_date, client_id, assigned_to, file_id, status 등).
  - **reports**: 케이스별 리포트 (case_id, report_html, file_id, uploaded_by 등).
  - **user_files**: 업로드 파일 추적 (user_id, s3_key, file_name, uploaded_at, case_id, report_id 등).
  - **task_assignments**: 메인 업무 (assigned_to, assigned_by, title, content, file_keys, comment_file_keys, due_date, status, assignment_type 등).
  - **task_subtasks**: 세부업무 (task_id, assigned_to, file_keys, comment_file_keys, status 등).
  - **task_file_attachments**: task/subtask별 첨부파일 행 단위 (task_id, subtask_id, s3_key, attachment_type(requester/assignee), uploaded_at) — 파일별 7일 만료 계산용.
  - **task_status_history**: 업무 상태 변경 이력.
  - **task_comments**: 업무/세부업무 댓글 (task_id, user_id, content) — API에서 CREATE TABLE IF NOT EXISTS로 생성.
  - **s3_updates**: S3 업로드 알림 (file_name, bucket_name, task_id, status 등). 담당자 지정 시 task_assignments와 연결.
  - **audit_log**: 케이스·사용자별 액션 로그.
  - **billing**: 케이스별 청구(선택).

스키마 통합본: `scripts/schema.sql`. 추가 마이그레이션: `scripts/migrations/*.sql` (예: `create_task_file_attachments.sql`).

---

## 4. API 라우트 요약

| 경로 | 역할 |
|------|------|
| **auth** | POST signin/signup/signout, GET me — JWT 발급·폐기·현재 사용자. |
| **tasks** | GET /api/tasks (목록), /api/tasks/[id] (메인/세부업무 단건), PATCH/DELETE. GET /api/tasks/calendar, /all, /assigned-by, /count, /reports. POST /api/tasks/[id]/create-report. |
| **tasks/[id]/subtasks** | GET 세부업무 목록. task_file_attachments에서 file_keys/comment_file_keys 조회. |
| **tasks/[id]/comments** | GET/POST/DELETE 댓글. task_comments 테이블. |
| **tasks/subtasks/[id]** | PATCH 세부업무 수정. 수정 시 task_file_attachments 동기화. |
| **storage** | POST upload, assign, delete; GET download, signed-url, preview, files, stats; POST resolve-file-keys(키→s3_key·uploaded_at 등), download-zip; POST extract(압축 해제). |
| **s3-updates** | GET 목록·단건 (admin/staff). 담당자 지정 시 task_assignments 생성·s3_updates.task_id 연결. GET presigned-url. |
| **reports** | GET 목록(권한별), POST 생성. POST export. |
| **profiles** | GET 목록(role 필터), PATCH [id] 역할 수정 (admin/staff). |
| **notifications/pending-staff** | GET 대기 목록, POST [id]/approve, [id]/reject. |
| **analytics/dashboard** | GET 통계 (admin/staff). |
| **holidays** | GET 공휴일. |
| **excel/parse** | POST 엑셀 파싱. |

---

## 5. 핵심 비즈니스 로직

### 5.1 업무(Task) 첨부·만료

- **저장**: 메인 업무는 `task_assignments.file_keys`(요청자), `comment_file_keys`(담당자). 세부업무는 `task_subtasks.file_keys` / `comment_file_keys`. 동시에 `task_file_attachments`에 행 단위로 동기화(PATCH·GET 시 백필).
- **만료**: 첨부 시점(uploaded_at) 기준 +7일. `user_files.uploaded_at` 또는 `task_file_attachments.uploaded_at` 사용. `lib/utils/dateHelpers.ts`의 `parseDateOnly`, `calculateFileExpiry` 등으로 일관 파싱.
- **resolve**: `POST /api/storage/resolve-file-keys`에 key 배열 전달 → user_files에서 s3_key·file_name·uploaded_at 반환(같은 키 여러 행이면 최신 행). staff/admin은 user_id 제한 없음.

### 5.2 S3 연동

- **업로드**: `storage/upload`에서 S3 업로드 후 `user_files` 등록. `lib/aws/s3.ts` 등으로 presigned URL·다운로드 처리.
- **s3_updates**: S3 이벤트 등으로 생성된 행. Admin에서 목록 조회 후 담당자 지정 시 `task_assignments` 생성 및 `s3_updates.task_id` 연결. `toS3Key(bucket_name, file_name)`으로 S3 키 생성.

### 5.3 케이스·리포트

- **cases**: client_id, assigned_to, status, file_id( user_files 참조) 등. Admin cases 목록·상세에서 조회·수정.
- **reports**: case_id별. report_html 또는 file_id로 저장. 권한에 따라 목록/생성/export 제한.

### 5.4 감사

- 중요 액션은 `lib/db/audit.ts`의 `writeAuditLog`로 `audit_log`에 기록.

---

## 6. 프론트엔드 페이지

- **admin**: cases(목록·상세·S3 업데이트 연결), calendar, reports, analytics, users, settings, file-upload, upload, upload-client, segmentation, excel. 대부분 role 검사 후 렌더.
- **client**: 진행현황(progress), 리포트(reports), 업로드(upload), 마스킹(masking), 엑셀(excel), analytics.
- **auth**: login, signup, signup-success.

레이아웃: `app/layout.tsx` (ThemeProvider, 테마 토글, Analytics). 글로벌 스타일: `app/globals.css`.

---

## 7. 환경 변수

- **DB**: DB_HOST, DB_PORT, DB_USER, DB_NAME, DB_PASSWORD(또는 AWS_DB_SECRET_NAME/DB_SECRET_ARN으로 Secrets Manager 사용).
- **인증**: JWT_SECRET.
- **AWS**: AWS_REGION, AWS_S3_BUCKET_NAME. 필요 시 AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY(또는 IAM 역할).

---

## 8. 스크립트·마이그레이션

- **scripts/schema.sql**: 전체 스키마 정의(profiles, cases, reports, user_files, task_assignments, task_subtasks, task_file_attachments, task_status_history, s3_updates, audit_log, billing 등).
- **scripts/migrations/create_task_file_attachments.sql**: task_file_attachments 테이블 생성.
- **scripts/migrations/add_s3_updates_task_id.sql**, **add_s3_updates_status.sql**, **trigger_s3_updates_task_assignments.sql**: s3_updates·task 연동.
- 기타 테스트/시드: scripts 내 SQL·mjs 등.

---

이 문서 하나로 레포의 인증·DB·API·업무/파일/만료·S3·리포트·페이지·환경·스크립트 흐름을 파악할 수 있다.
