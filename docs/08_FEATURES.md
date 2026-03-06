# 주요 기능 명세

## 목차

- [1. 인증·권한](#1-인증권한)
- [2. 업무 관리 (Task Management)](#2-업무-관리-task-management)
- [3. 파일 관리 (Storage)](#3-파일-관리-storage)
- [4. NIfTI 마스킹 뷰어](#4-nifti-마스킹-뷰어)
- [5. 케이스 관리](#5-케이스-관리)
- [6. 리포트 시스템](#6-리포트-시스템)
- [7. S3 업데이트 알림](#7-s3-업데이트-알림)
- [8. 스프레드시트](#8-스프레드시트)
- [9. 분석 대시보드](#9-분석-대시보드)
- [10. 캘린더](#10-캘린더)
- [11. 사용자 관리](#11-사용자-관리)

---

## 1. 인증·권한

### 로그인 / 로그아웃

- 이메일·비밀번호 기반 로그인
- JWT 토큰을 `auth-token` HttpOnly 쿠키에 저장 (유효기간 7일)
- 로그아웃 시 쿠키 즉시 삭제

### 회원가입

- **Client 회원가입**: 즉시 가입 완료 → 로그인 가능
- **Staff 회원가입**: `staff_signup_requests` 테이블에 저장 → 기존 Staff 승인 후 활성화

### Staff 가입 승인

- 기존 Staff는 `/admin/users` 페이지에서 대기 중인 Staff 신청 목록 확인
- 승인: `staff_signup_requests` → `profiles` 이전, 신청 레코드 삭제
- 거절: `staff_signup_requests` 레코드 삭제

---

## 2. 업무 관리 (Task Management)

업무(Task)는 Staff가 Client에게 배정하는 작업 단위입니다.

### 업무 생성 (Staff)

- 제목, 내용, 담당자(Client), 우선순위, 마감일 설정
- 단일 배정(`single`) 또는 다중 배정(`individual`)
  - **단일 배정**: 한 명의 Client에게 배정
  - **다중 배정**: 여러 Client에게 각각 세부업무(`task_subtasks`) 생성
- 첨부파일: S3 키 배열로 저장, `task_file_attachments`에 파일별 업로드 시각 기록

### 업무 상태

```
pending → in_progress → on_hold → awaiting_completion → completed
```

| 상태 | 의미 |
|------|------|
| `pending` | 배정 완료, 작업 시작 전 |
| `in_progress` | 담당자 작업 중 |
| `on_hold` | 일시 중지 (외부 요인 대기) |
| `awaiting_completion` | 담당자 완료 신청, Staff 최종 확인 대기 |
| `completed` | 완료 확정 |

상태 변경 시 `task_status_history`에 이력 자동 기록.

### 업무 첨부파일 (7일 만료)

첨부파일은 `task_file_attachments` 테이블에 파일별로 기록됩니다.

```
task_file_attachments
  ├── task_id
  ├── s3_key
  ├── file_name
  ├── attachment_type (requester / assignee)
  └── uploaded_at          ← 이 시각 기준 +7일 후 만료
```

만료 확인 로직:

```typescript
const isExpired = (uploadedAt: Date) => {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  return Date.now() - new Date(uploadedAt).getTime() > sevenDaysMs
}
```

### 세부업무 (Subtask)

`is_multi_assign=true`인 업무에서 각 담당자별로 `task_subtasks` 행이 생성됩니다.

- 세부업무별 제목, 파일, 상태, 댓글 독립 관리
- 상위 업무 상태는 세부업무 상태를 기반으로 집계

### 댓글 (Comments)

- 업무별 댓글 작성 (`task_comments` 테이블)
- Staff와 Client 모두 댓글 작성 가능
- 댓글에 파일 첨부 가능 (`comment_file_keys`)

---

## 3. 파일 관리 (Storage)

### 업로드

- multipart/form-data 방식, 최대 500MB
- S3에 저장 후 `user_files` 테이블에 메타데이터 기록
- 감사 로그(`audit_log`) 기록

### 다운로드

- Presigned URL 방식 (S3 직접 다운로드, 서버 미경유)
- 파일 소유권 검증 후 URL 발급

### 다운로드 토큰 (업무 첨부파일)

- 담당자가 업무의 모든 파일을 한 번에 다운로드하기 위한 토큰
- `task_assignments.download_token` 필드에 저장
- 유효기간: 1주

### ZIP 다운로드

여러 파일을 ZIP으로 묶어 다운로드합니다.

### 압축 해제 (Extract)

ZIP/7z 파일을 S3에서 다운로드 → 서버에서 압축 해제 → S3에 재업로드.

### 파일 삭제

S3 오브젝트 삭제 + `user_files` DB 레코드 삭제. 감사 로그 기록.

---

## 4. NIfTI 마스킹 뷰어

Client 전용 기능. 브라우저에서 NIfTI 파일을 열어 관심 영역(ROI) 마스크를 생성합니다.

### 처리 흐름

```
S3 Presigned URL → 브라우저에서 .nii 또는 .nii.gz 다운로드
    │
    ▼
nifti-reader-js — NIfTI-1/NIfTI-2 헤더 파싱
fflate — .nii.gz GZIP 해제 (서버 왕복 없음)
    │
    ▼
슬라이스 추출 (Axial / Sagittal / Coronal)
    │
    ▼
MaskingCanvas (Canvas API)
  ├── 슬라이스 렌더링
  ├── 브러시 도구로 마스크 영역 그리기
  └── 마스크 레이어 중첩 표시
    │
    ▼
마스크 다운로드 (.nii 포맷으로 내보내기)
```

### 주요 구현 파일

| 파일 | 역할 |
|------|------|
| `components/masking/niftiLoader.ts` | NIfTI 파싱, 슬라이스 데이터 추출, 마스크 생성 |
| `components/masking/MaskingCanvas.tsx` | Canvas 기반 마스킹 편집기 |
| `components/masking/SlicePanel.tsx` | 슬라이스 뷰어 패널 |

### DICOM 메타데이터 처리

- `lib/constants/dicomTags.ts`에 21개 DICOM 태그 상수 정의
- **PHI 필드(PatientName, PatientID 등)는 수집하지 않음**
- 비PII 태그(StudyDescription, Modality, SeriesNumber 등)만 `s3_updates.metadata`에 저장

---

## 5. 케이스 관리

### 케이스란?

한 명의 환자에 대한 4D Flow MRI 분석 의뢰 단위입니다.

| 필드 | 설명 |
|------|------|
| `case_number` | 케이스 고유 번호 (자동 생성 또는 수동 입력) |
| `patient_name` | 환자명 (PHI) |
| `study_date` | 검사일 (PHI) |
| `data_type` | 데이터 유형 (4D Flow, Angio 등) |
| `status` | registered → processing → completed / failed |
| `assigned_to` | 담당 Staff |
| `file_id` | 연관 DICOM/NIfTI 파일 (`user_files`) |

### 케이스 접근 제어

- Staff: 전체 케이스 목록 조회, 수정
- Client: 본인(`client_id`) 케이스만 조회

---

## 6. 리포트 시스템

### 리포트 생성 (Staff)

Staff가 업무 완료 후 분석 결과 리포트를 작성합니다.

```
POST /api/tasks/[id]/create-report
또는
POST /api/reports
```

- `report_html`: HTML 형식 리포트 본문
- `staff_comments`: Staff 코멘트
- 리포트 파일(PDF 등)은 `user_files`에 저장 후 `file_id` 참조

### 리포트 열람 (Client)

- 본인 케이스에 연결된 리포트만 열람 가능
- HTML 리포트는 `SafeHtml` 컴포넌트로 렌더링 (DOMPurify sanitize)

### 리포트 내보내기

```
GET /api/reports/export
```

PDF 또는 Excel 형식으로 다운로드.

---

## 7. S3 업데이트 알림

### 흐름

외부 시스템(Lambda 등)이 S3에 파일을 업로드하면 `s3_updates` 테이블에 알림이 삽입됩니다.

```
외부 시스템 (Lambda / S3 Event Notification)
    │
    │ INSERT INTO s3_updates
    ▼
Staff Admin 페이지 (/admin/cases)
    │
    │ 업무 내용 검토 → Client 선정
    ▼
PATCH /api/s3-updates/[id]
    │
    ├── task_assignments 생성
    └── s3_updates.task_id 업데이트
```

### S3 업데이트 페이지 기능

- 미처리 알림 목록 조회 (task_id가 null인 행)
- 파일 미리보기 (Presigned URL로 직접 확인)
- 메모 작성 (`note` 필드)
- 담당자(Client) 배정 → 업무 자동 생성

---

## 8. 스프레드시트

인앱 데이터 관리를 위한 스프레드시트 기능입니다.

### 구조

```
spreadsheet_folders (폴더 계층)
  └── spreadsheet_files (스프레드시트 파일)
        └── spreadsheet_rows (행 데이터 — JSON)
```

### 기능

- 폴더 계층 구조 (무한 중첩 가능, `parent_id` 자기 참조)
- 스프레드시트 파일 CRUD
- 행 단위 데이터 추가·수정·삭제
- CSV/Excel 가져오기(`import`) / 내보내기(`export`)
- 폴더·파일 트리 구조 조회 (`/api/spreadsheet/tree`)

---

## 9. 분석 대시보드

### Staff 분석 (`/admin/analytics`)

- 전체 케이스 수 / 상태별 분포
- 이번 달 완료 건수
- 담당자별 업무 처리 현황
- 스토리지 사용량

### Client 분석 (`/client/analytics`)

- 본인 케이스 통계
- 완료된 업무 이력

---

## 10. 캘린더

### Staff 캘린더 (`/admin/calendar`)

- 전체 업무의 마감일을 월·주 단위 캘린더로 표시
- 업무 상태별 색상 구분
- 캘린더에서 직접 업무 클릭 → 상세 이동

### Client 캘린더 (`/client/progress`)

- 본인 업무만 표시

---

## 11. 사용자 관리

### Staff 전용 (`/admin/users`)

- 전체 사용자 목록 조회 (Staff / Client)
- 역할 변경 (`PATCH /api/profiles/[id]`)
- Staff 가입 대기 요청 승인·거절
- 사용자 메모 작성

### 프로필

- 모든 사용자: 이름, 소속, 비밀번호 수정 가능
- 역할 변경: Staff만 가능

---

## 기능 구현 위치 요약

| 기능 | 페이지 경로 | API 경로 | DB 테이블 |
|------|-----------|---------|---------|
| 로그인 | `/auth/login` | `/api/auth/signin` | `profiles` |
| 업무 목록 | `/admin/progress`, `/client/progress` | `/api/tasks` | `task_assignments` |
| NIfTI 마스킹 | `/client/masking` | `/api/storage/signed-url` | `user_files` |
| 파일 업로드 | `/admin/upload`, `/client/upload` | `/api/storage/upload` | `user_files` |
| 케이스 목록 | `/admin/cases` | `/api/s3-updates` | `cases`, `s3_updates` |
| 리포트 | `/admin/reports`, `/client/reports` | `/api/reports` | `reports` |
| 스프레드시트 | `/admin/spreadsheet`, `/client/excel` | `/api/spreadsheet/*` | `spreadsheet_*` |
| 사용자 관리 | `/admin/users` | `/api/profiles` | `profiles` |
| 통계 | `/admin/analytics`, `/client/analytics` | `/api/analytics/dashboard` | 다수 |
