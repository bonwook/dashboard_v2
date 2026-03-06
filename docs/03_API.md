# API 레퍼런스

## 목차

- [1. 공통 규칙](#1-공통-규칙)
- [2. 인증 API](#2-인증-api)
- [3. 업무 API](#3-업무-api)
- [4. 파일 스토리지 API](#4-파일-스토리지-api)
- [5. S3 업데이트 API](#5-s3-업데이트-api)
- [6. 리포트 API](#6-리포트-api)
- [7. 케이스 API](#7-케이스-api)
- [8. 프로필 API](#8-프로필-api)
- [9. 알림 API](#9-알림-api)
- [10. 스프레드시트 API](#10-스프레드시트-api)
- [11. 분석 API](#11-분석-api)
- [12. 기타](#12-기타)
- [13. 오류 코드](#13-오류-코드)

---

## 1. 공통 규칙

### 인증

- 모든 인증 필요 엔드포인트는 `auth-token` **HttpOnly 쿠키**를 요구합니다.
- 쿠키 없거나 JWT 검증 실패 시 → `401 Unauthorized`
- 역할 권한 부족 시 → `403 Forbidden`

### Rate Limiting

| 대상 | 제한 |
|------|------|
| 인증 엔드포인트 (`/api/auth/*`) | 5분 / 최대 10회 |
| 일반 API 엔드포인트 | 15분 / 최대 100회 |

초과 시 → `429 Too Many Requests`

### 공통 응답 형식

```json
// 성공
{ "data": ... }
{ "message": "..." }

// 오류
{ "error": "오류 설명" }
```

### 기본 URL

```
https://<your-domain>.com/api
```

---

## 2. 인증 API

### `POST /api/auth/signin`

로그인. 성공 시 `auth-token` HttpOnly 쿠키(7일) 발급.

**요청**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**응답** `200 OK`

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "홍길동",
    "role": "staff"
  }
}
```

**오류**: `401` 자격 증명 불일치, `429` Rate Limit 초과

---

### `POST /api/auth/signup`

Client 회원가입. 즉시 `profiles` 테이블에 삽입되며 `auth-token` 쿠키를 발급합니다.

> Staff 회원가입은 별도 플로우 사용 → `staff_signup_requests` 테이블에 삽입 후 승인 대기

**요청**

```json
{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "홍길동",
  "organization": "서울대학교병원",
  "role": "client"
}
```

**응답** `201 Created`

```json
{ "user": { "id": "uuid", "email": "...", "role": "client" } }
```

---

### `POST /api/auth/signout`

로그아웃. `auth-token` 쿠키를 삭제합니다.

**응답** `200 OK` `{ "message": "Signed out successfully" }`

---

### `GET /api/auth/me`

현재 인증된 사용자 정보 반환.

**응답** `200 OK`

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "홍길동",
    "role": "staff",
    "organization": "Flonics"
  }
}
```

---

## 3. 업무 API

### `GET /api/tasks`

업무 목록 조회. **staff**: 전체 업무. **client**: 본인에게 배정된 업무만.

**Query Parameters**

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `status` | string | 상태 필터 (pending, in_progress, completed 등) |
| `priority` | string | 우선순위 필터 |
| `assigned_to` | string | 담당자 ID 필터 (staff 전용) |
| `page` | number | 페이지 번호 |
| `limit` | number | 페이지 크기 |

**응답** `200 OK`

```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "케이스 분석 요청",
      "status": "pending",
      "priority": "high",
      "assigned_to": "uuid",
      "assigned_by": "uuid",
      "due_date": "2024-12-31",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 42
}
```

---

### `POST /api/tasks`

업무 생성 (Staff 전용).

**요청**

```json
{
  "title": "NIfTI 마스킹 업무",
  "content": "업무 내용 상세",
  "assigned_to": "client-uuid",
  "priority": "high",
  "due_date": "2024-12-31",
  "file_keys": ["tasks/uuid/file.nii.gz"]
}
```

---

### `GET /api/tasks/[id]`

단건 조회. client는 본인 업무만 접근 가능.

---

### `PATCH /api/tasks/[id]`

업무 수정. client는 status·comment만 변경 가능.

**요청**

```json
{
  "status": "completed",
  "comment": "작업 완료했습니다."
}
```

---

### `DELETE /api/tasks/[id]`

업무 삭제 (Staff 전용).

---

### `GET /api/tasks/[id]/subtasks`

업무의 세부업무 목록 조회.

### `POST /api/tasks/[id]/comments`

댓글 작성.

### `GET /api/tasks/[id]/comments`

댓글 목록 조회.

### `POST /api/tasks/[id]/create-report`

업무 완료 후 리포트 생성 (Staff 전용).

### `POST /api/tasks/[id]/attach-s3`

업무에 S3 파일 첨부.

### `GET /api/tasks/calendar`

캘린더 뷰용 업무 목록 (기간 필터).

### `GET /api/tasks/count`

업무 수 통계.

### `GET /api/tasks/all`

페이지네이션 없는 전체 목록 (Staff 전용).

---

## 4. 파일 스토리지 API

### `POST /api/storage/upload`

파일 업로드 (multipart/form-data). 최대 500MB.

**요청** `multipart/form-data`

| 필드 | 설명 |
|------|------|
| `file` | 업로드할 파일 |
| `taskId` | 연관 업무 ID (선택) |
| `fileType` | dicom/nifti/report/document/etc |

**응답** `200 OK`

```json
{
  "fileId": "uuid",
  "s3Key": "users/uuid/filename.nii.gz",
  "fileName": "filename.nii.gz",
  "fileSize": 52428800
}
```

---

### `GET /api/storage/signed-url`

단건 파일 Presigned URL 생성 (유효시간: 1시간).

**Query**: `?key=users/uuid/file.nii.gz`

**응답** `200 OK`

```json
{ "url": "https://s3.amazonaws.com/...?X-Amz-Signature=..." }
```

---

### `GET /api/storage/download`

파일 다운로드 (서버 프록시 방식).

### `GET /api/storage/download-zip`

여러 파일을 ZIP으로 묶어 다운로드.

### `DELETE /api/storage/delete`

파일 삭제 (S3 오브젝트 + DB 레코드).

### `GET /api/storage/files`

사용자의 파일 목록 조회.

### `GET /api/storage/stats`

스토리지 사용량 통계.

### `GET /api/storage/preview`

이미지 파일 미리보기 URL 생성.

### `POST /api/storage/extract`

압축 파일(ZIP/7z) 해제.

### `POST /api/storage/assign`

파일을 특정 케이스 또는 리포트에 연결.

### `POST /api/storage/resolve-file-keys`

S3 키 배열 → `{s3_key, file_name, uploaded_at}` 변환 (만료 계산에 사용).

**요청**

```json
{
  "keys": ["tasks/uuid/file.nii.gz", "tasks/uuid/file2.nii.gz"]
}
```

**응답** `200 OK`

```json
{
  "files": [
    {
      "s3_key": "tasks/uuid/file.nii.gz",
      "file_name": "file.nii.gz",
      "uploaded_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

## 5. S3 업데이트 API

S3에 업로드된 파일의 알림(`s3_updates` 테이블) 관리.

### `GET /api/s3-updates`

미처리 S3 업로드 알림 목록 (Staff 전용).

**응답** `200 OK`

```json
{
  "updates": [
    {
      "id": 1,
      "file_name": "patient_case_001.nii.gz",
      "s3_key": "incoming/patient_case_001.nii.gz",
      "file_size": 52428800,
      "upload_time": "2024-01-01T00:00:00Z",
      "task_id": null,
      "note": null
    }
  ]
}
```

---

### `GET /api/s3-updates/[id]`

단건 S3 업데이트 조회.

### `PATCH /api/s3-updates/[id]`

S3 업데이트에 업무 연결 또는 메모 작성.

**요청**

```json
{
  "task_id": "task-uuid",
  "note": "케이스 검토 완료, 담당자 배정함"
}
```

### `GET /api/s3-updates/[id]/presigned-url`

S3 업데이트 파일의 Presigned URL 생성.

---

## 6. 리포트 API

### `GET /api/reports`

리포트 목록. staff: 전체. client: 본인 케이스 리포트만.

### `POST /api/reports`

리포트 생성 (Staff 전용).

### `GET /api/reports/pending`

미확인 리포트 목록.

### `GET /api/reports/info`

리포트 메타데이터 조회.

### `POST /api/reports/bulk`

복수 리포트 일괄 생성.

### `GET /api/reports/export`

리포트 파일 내보내기 (PDF/Excel).

---

## 7. 케이스 API

> 케이스는 s3-updates 또는 직접 생성 방식으로 관리됩니다.
> 케이스 데이터는 `cases` 테이블에, 관련 파일은 `user_files`에 저장됩니다.

**공통 엔드포인트** (Staff 전용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tasks/assigned-by` | Staff가 배정한 업무 목록 |
| GET | `/api/tasks/assigned-by-count` | Staff 배정 업무 수 통계 |
| GET | `/api/tasks/reports` | 업무 연관 리포트 목록 |

---

## 8. 프로필 API

### `GET /api/profiles`

사용자 목록 (Staff 전용). Client 또는 Staff 전체.

**Query**: `?role=client`, `?role=staff`

### `GET /api/profiles/[id]`

특정 사용자 프로필 조회.

### `PATCH /api/profiles/[id]`

프로필 수정 (Staff: 역할 변경 가능, Client: 본인만).

---

## 9. 알림 API

Staff 가입 승인/거절 플로우.

### `GET /api/notifications/pending-staff`

승인 대기 중인 Staff 가입 요청 목록 (Staff 전용).

### `POST /api/notifications/pending-staff/[id]/approve`

Staff 가입 요청 승인 → `profiles` 테이블에 삽입.

### `POST /api/notifications/pending-staff/[id]/reject`

Staff 가입 요청 거절 → `staff_signup_requests` 삭제.

---

## 10. 스프레드시트 API

인앱 데이터 관리 스프레드시트. 폴더 계층 구조 지원.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/spreadsheet/tree` | 폴더·파일 트리 구조 |
| GET/POST | `/api/spreadsheet/folders` | 폴더 목록·생성 |
| GET/PATCH/DELETE | `/api/spreadsheet/folders/[id]` | 폴더 상세·수정·삭제 |
| GET/POST | `/api/spreadsheet/files` | 파일 목록·생성 |
| GET/PATCH/DELETE | `/api/spreadsheet/files/[id]` | 파일 상세·수정·삭제 |
| GET | `/api/spreadsheet/files/[id]/data` | 파일 데이터(행) 조회 |
| POST | `/api/spreadsheet/files/[id]/import` | CSV/Excel 가져오기 |
| GET | `/api/spreadsheet/files/[id]/export` | CSV/Excel 내보내기 |

---

## 11. 분석 API

### `GET /api/analytics/dashboard`

대시보드 통계 (Staff 전용).

**응답**

```json
{
  "totalCases": 150,
  "pendingTasks": 23,
  "completedThisMonth": 45,
  "storageUsageGB": 12.3
}
```

---

## 12. 기타

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/holidays` | 한국 공휴일 목록 (공공데이터 API 연동) |
| POST | `/api/excel/parse` | Excel 파일 파싱 후 데이터 반환 |

---

## 13. 오류 코드

| HTTP 상태 | 의미 | 원인 |
|-----------|------|------|
| `400` | Bad Request | 요청 파라미터 누락 또는 형식 오류 |
| `401` | Unauthorized | JWT 쿠키 없음 또는 검증 실패 |
| `403` | Forbidden | 역할 권한 부족 또는 타인 리소스 접근 시도 |
| `404` | Not Found | 리소스 없음 |
| `409` | Conflict | 이메일 중복 등 충돌 |
| `413` | Payload Too Large | 파일 크기 500MB 초과 |
| `429` | Too Many Requests | Rate Limit 초과 |
| `500` | Internal Server Error | 서버 오류 (로그 확인 필요) |
