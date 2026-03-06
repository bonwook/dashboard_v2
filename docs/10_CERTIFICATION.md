# 인증 문서 (PRD / SRS / SDS)

> **목적**: 의료기기 소프트웨어 인증(IEC 62304, ISO 14971)에 필요한 요구사항·설계·검증 근거를 통합 관리합니다.
> 규제 기관 제출 전 법무·규제 담당자의 검토가 필요합니다.

## 목차

- [1. PRD — 제품 요구사항](#1-prd--제품-요구사항)
- [2. SRS — 소프트웨어 요구사항 명세](#2-srs--소프트웨어-요구사항-명세)
- [3. SDS — 소프트웨어 설계 명세](#3-sds--소프트웨어-설계-명세)
- [4. 검증 및 확인 (V&V)](#4-검증-및-확인-vv)

---

## 1. PRD — 제품 요구사항

### 1.1 제품 개요

| 항목 | 내용 |
|------|------|
| **제품명** | Flonics Dashboard |
| **버전** | v1.x |
| **제품 유형** | 의료 영상 분석 운영 지원 SaaS |
| **의도된 용도** | 4D Flow MRI 의료 영상 분석 업무의 배정·추적·파일 관리·결과 리포트 제공 |
| **의도된 사용자** | Staff (업무 조율), Client (분석 담당자) |
| **의도된 사용 환경** | 인터넷 연결된 웹 브라우저 (Chrome/Edge 최신 버전) |
| **SaMD 분류** | IMDRF Category I / IEC 62304 Class B |

### 1.2 비즈니스 요구사항

| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| BR-01 | 외부 의뢰(S3 이벤트) 수신 및 담당자 배정 기능 | 필수 |
| BR-02 | DICOM/NIfTI 파일 안전 저장 및 관리 (AWS S3) | 필수 |
| BR-03 | 브라우저 기반 NIfTI 마스킹 편집 기능 | 필수 |
| BR-04 | 분석 결과 리포트 생성·제공 기능 | 필수 |
| BR-05 | 역할 기반 접근 제어 (Staff / Client 분리) | 필수 |
| BR-06 | 모든 주요 액션의 감사 로그 추적 | 필수 |
| BR-07 | 업무 첨부파일 7일 만료 정책 | 필수 |
| BR-08 | 인앱 스프레드시트 기반 데이터 관리 | 권장 |
| BR-09 | 통계 대시보드 제공 | 권장 |

### 1.3 사용자 스토리

#### Staff

- US-S01: Staff로서, S3에 업로드된 파일 알림을 확인하고 Client에게 업무를 배정할 수 있다.
- US-S02: Staff로서, 전체 업무·케이스의 진행 상태를 한눈에 볼 수 있다.
- US-S03: Staff로서, 분석 완료 후 HTML 기반 리포트를 생성하고 Client에게 제공할 수 있다.
- US-S04: Staff로서, Client 회원가입 요청을 승인하거나 거절할 수 있다.

#### Client

- US-C01: Client로서, 배정받은 업무 목록을 확인하고 파일을 다운로드할 수 있다.
- US-C02: Client로서, 브라우저에서 NIfTI 파일을 열어 ROI 마스크를 생성하고 다운로드할 수 있다.
- US-C03: Client로서, 업무 완료 후 결과 파일을 업로드하고 상태를 변경할 수 있다.
- US-C04: Client로서, 리포트를 확인하고 코멘트를 남길 수 있다.

---

## 2. SRS — 소프트웨어 요구사항 명세

### 2.1 기능 요구사항

| ID | 요구사항 | 관련 BR | 구현 위치 |
|----|---------|---------|---------|
| FR-01 | 이메일·비밀번호 기반 사용자 인증 | BR-05 | `app/api/auth/signin` |
| FR-02 | JWT HttpOnly 쿠키 발급·검증 (7일 유효) | BR-05 | `lib/database/auth.ts` |
| FR-03 | RBAC — staff/client 역할 분리 | BR-05 | `lib/auth/index.ts` |
| FR-04 | Client 데이터 격리 (본인 리소스만 접근) | BR-05 | 각 API Route |
| FR-05 | 업무 CRUD — 배정·상태 관리·댓글 | BR-01, BR-07 | `app/api/tasks/` |
| FR-06 | 업무 세부업무 (다중 담당자 지원) | BR-01 | `task_subtasks` |
| FR-07 | 업무 첨부파일 7일 만료 관리 | BR-07 | `task_file_attachments` |
| FR-08 | S3 파일 업로드/다운로드/삭제 | BR-02 | `app/api/storage/`, `lib/services/aws/s3.ts` |
| FR-09 | Presigned URL 기반 파일 접근 | BR-02 | `lib/services/aws/s3.ts` |
| FR-10 | NIfTI-1/2 파싱 및 슬라이스 렌더링 | BR-03 | `components/masking/niftiLoader.ts` |
| FR-11 | Canvas 기반 마스킹 편집 및 내보내기 | BR-03 | `components/masking/MaskingCanvas.tsx` |
| FR-12 | HTML 리포트 생성·저장·열람 | BR-04 | `app/api/reports/` |
| FR-13 | S3 이벤트 알림 수신 및 업무 연결 | BR-01 | `app/api/s3-updates/` |
| FR-14 | 감사 로그 기록 | BR-06 | `lib/db/audit.ts` |
| FR-15 | Staff 가입 승인·거절 플로우 | BR-05 | `app/api/notifications/` |
| FR-16 | 인앱 스프레드시트 CRUD | BR-08 | `app/api/spreadsheet/` |
| FR-17 | 통계 대시보드 | BR-09 | `app/api/analytics/` |

### 2.2 비기능 요구사항

| ID | 요구사항 | 기준 |
|----|---------|------|
| NFR-01 | 가용성 | 99.5% 이상 (Aurora 자동 재시작, PM2 자동 재시작) |
| NFR-02 | 파일 업로드 크기 | 단일 파일 최대 500MB |
| NFR-03 | 응답 시간 | 일반 API < 500ms, 파일 업로드 제외 |
| NFR-04 | 동시 사용자 | 최소 50명 동시 지원 |
| NFR-05 | 데이터 내구성 | S3 11 9s, Aurora 자동 스냅샷 7일 |
| NFR-06 | 인증 보안 | bcryptjs cost 10, JWT HS256, HttpOnly 쿠키 |
| NFR-07 | 전송 암호화 | HTTPS (TLS 1.2/1.3) 필수 |
| NFR-08 | 브라우저 지원 | Chrome, Edge 최신 2버전 |
| NFR-09 | 감사 추적 | 모든 주요 액션의 audit_log 기록 (best-effort) |
| NFR-10 | Rate Limiting | 인증 API: 5분/10회, 일반: 15분/100회 |

### 2.3 인터페이스 요구사항

| ID | 요구사항 |
|----|---------|
| IR-01 | REST API — JSON 형식, HTTP 상태 코드 표준 준수 |
| IR-02 | AWS S3 — AWS SDK v3 사용 |
| IR-03 | AWS Secrets Manager — AWS SDK v3 사용 |
| IR-04 | Aurora MySQL — mysql2/promise 드라이버 |
| IR-05 | 공공데이터 공휴일 API — HOLIDAY_API_KEY 환경 변수 |

---

## 3. SDS — 소프트웨어 설계 명세

### 3.1 아키텍처 설계

전체 아키텍처 상세: [`docs/01_ARCHITECTURE.md`](01_ARCHITECTURE.md)

```
클라이언트 브라우저
  │ HTTPS
  ▼
Nginx (리버스 프록시, SSL 종료)
  │
  ▼
Next.js 16 App Router (PM2, Port 3000)
  ├── 서버 컴포넌트 — PHI 데이터 서버 처리
  ├── API Routes — REST 엔드포인트
  └── lib/ — 인증, DB, S3, 감사 로그
  │                │
  ▼                ▼
Aurora MySQL      AWS S3
(메타데이터)       (파일 저장)
  │
  ▼
Secrets Manager (DB 자격 증명)
```

### 3.2 데이터 설계

DB 스키마 상세: [`docs/02_DATABASE.md`](02_DATABASE.md)
스키마 파일: `scripts/schema.sql`

| 데이터 그룹 | 테이블 | 저장소 |
|-----------|-------|-------|
| 사용자·권한 | `profiles`, `staff_signup_requests` | Aurora MySQL |
| 케이스·리포트 | `cases`, `reports` | Aurora MySQL |
| 파일 추적 | `user_files` | Aurora MySQL (메타) + S3 (파일 본체) |
| 업무 관리 | `task_assignments`, `task_subtasks`, `task_file_attachments`, `task_status_history`, `task_comments` | Aurora MySQL |
| S3 알림 | `s3_updates` | Aurora MySQL |
| 스프레드시트 | `spreadsheet_folders`, `spreadsheet_files`, `spreadsheet_rows` | Aurora MySQL |
| 감사 추적 | `audit_log` | Aurora MySQL |

### 3.3 보안 설계

보안 상세: [`docs/05_SECURITY.md`](05_SECURITY.md)

#### 설계 원칙

| 원칙 | 설명 | 구현 방식 |
|------|------|---------|
| **최소 권한** | 각 사용자는 본인 업무에 필요한 최소한의 데이터에만 접근 | `requireRole()`, Client 쿼리에 `user_id` 필터 강제 |
| **서버 측 PHI 처리** | 환자 정보는 서버 컴포넌트에서만 처리, 클라이언트 노출 차단 | Next.js App Router 서버 컴포넌트 활용 |
| **클라이언트 측 영상 처리** | NIfTI 파일은 브라우저에서 직접 처리하여 서버 전송 불필요 | nifti-reader-js + fflate |
| **Stateless 인증** | 외부 세션 저장소 없이 JWT로 인증 상태 유지 | HttpOnly 쿠키 + JWT |
| **Prepared Statement 전용** | 모든 DB 쿼리는 파라미터 바인딩 필수 | `lib/database/mysql.ts query()` 함수 |
| **감사 가능성** | 주요 액션은 모두 감사 로그로 추적 가능 | `writeAuditLog()` best-effort |

### 3.4 모듈 설계

#### 인증 모듈

| 파일 | 역할 |
|------|------|
| `lib/database/auth.ts` | `hashPassword()`, `verifyPassword()`, `generateToken()`, `verifyToken()` |
| `lib/auth/index.ts` | `getCurrentUser()`, `requireAuth()`, `requireRole()` |

#### DB 모듈

| 파일 | 역할 |
|------|------|
| `lib/database/mysql.ts` | 연결 풀 관리, `query()`, `queryOne()` — 항상 Prepared Statement |
| `lib/aws/secrets.ts` | Secrets Manager에서 DB 비밀번호 조회 |

#### S3 모듈

| 파일 | 역할 |
|------|------|
| `lib/services/aws/s3.ts` | 업로드, 다운로드, 삭제, Presigned URL 생성 |

#### NIfTI 모듈

| 파일 | 역할 |
|------|------|
| `components/masking/niftiLoader.ts` | NIfTI 파싱, 슬라이스 추출, 마스크 NIfTI 생성 |
| `components/masking/MaskingCanvas.tsx` | Canvas 마스킹 편집 UI |

---

## 4. 검증 및 확인 (V&V)

### 4.1 단위 테스트

```bash
npm test
```

| 대상 모듈 | 테스트 내용 |
|---------|----------|
| `lib/database/auth.ts` | bcrypt 해싱·검증, JWT 발급·검증 |
| `lib/database/mysql.ts` | DB 연결, 쿼리 실행 |
| NIfTI 파싱 | 헤더 파싱 정확성, 슬라이스 추출 |

### 4.2 통합 테스트 체크리스트

#### 인증 플로우

- [ ] Client 회원가입 → 즉시 로그인 가능
- [ ] Staff 회원가입 → 승인 전 로그인 불가
- [ ] Staff 승인 후 → 로그인 가능
- [ ] 잘못된 비밀번호 → 401 반환
- [ ] Rate Limit 초과 (11회 연속) → 429 반환
- [ ] 만료된 JWT → 401 반환
- [ ] 로그아웃 후 쿠키 삭제 확인

#### RBAC 검증

- [ ] Client가 `/api/tasks` 전체 조회 시 본인 업무만 반환
- [ ] Client가 Staff 전용 API 호출 시 403 반환
- [ ] Client가 타인 파일 접근 시 403 반환

#### 파일 업로드·다운로드

- [ ] 정상 파일 (< 500MB) 업로드 성공
- [ ] 500MB 초과 파일 → 413 반환
- [ ] Presigned URL 만료 (1시간) 후 접근 → 403
- [ ] S3 업로드 후 `user_files` DB 레코드 확인

#### 업무 플로우

- [ ] Staff 업무 생성 → Client에게 표시
- [ ] Client 상태 변경 → `task_status_history` 기록 확인
- [ ] 7일 경과 첨부파일 만료 확인

### 4.3 보안 테스트 체크리스트

- [ ] SQL Injection 시도 → Prepared Statement로 차단 확인
- [ ] XSS 시도 (리포트 HTML 입력) → DOMPurify sanitize 확인
- [ ] 인증 없이 API 호출 → 401 반환 확인
- [ ] HttpOnly 쿠키 JavaScript 접근 차단 확인 (`document.cookie`에 `auth-token` 미노출)

### 4.4 릴리스 기준

| 기준 | 요건 |
|------|------|
| 단위 테스트 | 통과율 100% |
| 통합 테스트 | 위 체크리스트 전항목 통과 |
| TypeScript 오류 | `npm run tsc` 오류 0개 |
| ESLint | `npm run lint` 오류 0개 |
| 보안 취약점 | Critical·High 취약점 0개 (`npm audit`) |
| 성능 | 일반 API 응답 < 500ms (로컬 환경 기준) |
