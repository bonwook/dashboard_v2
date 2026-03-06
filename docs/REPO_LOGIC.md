# Flonics Dashboard — 전체 레포 로직

> ⚠️ **이 문서는 내부 초기 메모 문서입니다.**
> 최신 공식 문서는 아래를 참조하십시오. 내용이 충돌할 경우 번호가 붙은 docs 파일이 우선합니다.
>
> | 이 문서의 섹션 | 최신 공식 문서 |
> |-------------|-------------|
> | 프로젝트 구조 | [`docs/01_ARCHITECTURE.md`](01_ARCHITECTURE.md) |
> | 인증·권한 | [`docs/05_SECURITY.md`](05_SECURITY.md) |
> | 데이터베이스 테이블 | [`docs/02_DATABASE.md`](02_DATABASE.md) |
> | API 라우트 요약 | [`docs/03_API.md`](03_API.md) |
> | 핵심 비즈니스 로직 | [`docs/08_FEATURES.md`](08_FEATURES.md) |
> | 환경 변수 | [`docs/06_DEPLOYMENT.md`](06_DEPLOYMENT.md) |
>
> 새로 들어온 분은 **`README.md` → `docs/01_ARCHITECTURE.md`** 순서로 읽기 시작하는 것을 권장합니다.

---

Next.js(App Router) 기반 4D Flow MRI 분석 대시보드. 인증·업무·케이스·리포트·파일(S3) 관리를 하나의 앱에서 처리한다.

---

## 1. 프로젝트 구조

```
dashboard_v2/
├── app/
│   ├── api/                    # REST API (인증: auth-token 쿠키)
│   │   ├── auth/               # signin, signup, signout, me
│   │   ├── tasks/              # 업무 CRUD, 댓글, 세부업무, 캘린더
│   │   ├── storage/            # 업로드, 다운로드, presigned URL, delete, extract
│   │   ├── s3-updates/         # S3 업로드 알림 목록·단건·presigned-url
│   │   ├── reports/            # 리포트 목록·생성·export
│   │   ├── profiles/           # 프로필 목록·역할 수정
│   │   ├── notifications/      # Staff 가입 대기·승인/거절
│   │   ├── analytics/          # 대시보드 통계
│   │   ├── holidays/           # 공휴일 API
│   │   ├── excel/              # 엑셀 파싱
│   │   └── spreadsheet/        # 인앱 스프레드시트 CRUD
│   ├── admin/                  # Staff 전용 페이지
│   ├── client/                 # Client 전용 페이지
│   └── auth/                   # 로그인, 회원가입
├── lib/
│   ├── database/               # mysql.ts (연결풀·query·queryOne), auth.ts
│   ├── auth/                   # getCurrentUser, requireAuth, requireRole
│   ├── aws/                    # secrets.ts (Secrets Manager)
│   ├── services/aws/           # s3.ts (업로드·다운로드·Presigned URL)
│   ├── middleware/             # rate-limit.ts
│   ├── db/                     # audit.ts (writeAuditLog)
│   ├── utils/                  # fileKeyHelpers, dateHelpers 등
│   └── hooks/                  # useTasks, useCalendar 등
├── components/                 # UI 컴포넌트 (masking, task, ui 등)
└── scripts/                    # schema.sql, migrations/
```

---

## 2. 인증·권한

- **인증**: JWT를 `auth-token` HttpOnly 쿠키에 저장. API는 `requireAuth()` / `requireRole()` 로 검증.
- **역할**: `profiles.role` — `staff`, `client`.
  - **staff**: 전체 케이스·업무·리포트·S3 업데이트·프로필 조회/수정, Staff 승인/거절.
  - **client**: 본인에게 배정된 업무·케이스·리포트, 본인 파일만 접근.
- **가입**: Client는 즉시 가입. Staff는 `staff_signup_requests`에 저장 후 기존 Staff 승인 시 `profiles`로 이전.

---

## 3. 데이터베이스 (Aurora MySQL)

- **연결**: `lib/database/mysql.ts` — AWS Secrets Manager에서 비밀번호 자동 조회.
- **주요 테이블** (총 16개):
  - `profiles`, `staff_signup_requests`, `cases`, `reports`, `user_files`, `billing`, `audit_log`
  - `task_assignments`, `task_subtasks`, `task_file_attachments`, `task_status_history`, `task_comments`
  - `s3_updates`, `spreadsheet_folders`, `spreadsheet_files`, `spreadsheet_rows`

---

## 4. API 라우트 요약

| 경로 | 역할 |
|------|------|
| **auth** | POST signin/signup/signout, GET me |
| **tasks** | CRUD, 댓글, 세부업무, 캘린더, 리포트 생성 |
| **storage** | 업로드, 다운로드, Presigned URL, 삭제, 압축 해제 |
| **s3-updates** | S3 이벤트 알림 목록·단건, 담당자 배정 시 task 연결 |
| **reports** | 목록, 생성, export |
| **profiles** | 목록, 역할 수정 |
| **notifications** | Staff 가입 대기 승인/거절 |
| **analytics** | 통계 대시보드 |
| **spreadsheet** | 폴더·파일·행 CRUD |

---

## 5. 핵심 비즈니스 로직

### 업무 첨부·만료
- 첨부파일은 `task_file_attachments`에 행 단위 기록 (uploaded_at 기준 +7일 만료).
- `POST /api/storage/resolve-file-keys` → 키 배열을 s3_key·file_name·uploaded_at으로 변환.

### S3 연동
- `s3_updates`: S3 이벤트로 생성된 알림 행. Staff가 담당자 지정 시 `task_assignments` 생성 및 연결.

### 감사 로그
- 주요 액션은 `lib/db/audit.ts`의 `writeAuditLog()`로 `audit_log`에 기록 (best-effort).

---

## 6. 환경 변수

- **DB**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, `AWS_DB_SECRET_NAME` 또는 `DB_SECRET_ARN`
- **인증**: `JWT_SECRET`
- **AWS**: `AWS_REGION`, `AWS_S3_BUCKET_NAME`, IAM Role 또는 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
- **외부**: `HOLIDAY_API_KEY`, `NEXT_PUBLIC_APP_URL`

---

이 문서 하나로 레포의 인증·DB·API·업무/파일/만료·S3·페이지·환경 흐름을 파악할 수 있다.
