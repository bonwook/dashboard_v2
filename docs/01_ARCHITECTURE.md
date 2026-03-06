# 시스템 아키텍처

## 목차

- [1. 프로젝트 개요](#1-프로젝트-개요)
- [2. 전체 시스템 구성도](#2-전체-시스템-구성도)
- [3. 기술 스택 및 선택 이유](#3-기술-스택-및-선택-이유)
- [4. 디렉토리 구조](#4-디렉토리-구조)
- [5. 데이터 흐름](#5-데이터-흐름)
- [6. 요청 처리 흐름](#6-요청-처리-흐름)

---

## 1. 프로젝트 개요

**Flonics Dashboard**는 4D Flow MRI 의료 영상 분석 서비스의 운영을 지원하는 웹 기반 플랫폼입니다.

### 핵심 목적

1. **업무 배정**: 외부 의뢰(S3 이벤트 등)를 Staff가 검토하여 실무 담당자(Client)에게 배정
2. **파일 관리**: DICOM 또는 NIfTI 파일을 AWS S3에 안전하게 저장하고 관리
3. **마스킹 편집**: Client가 브라우저 내 NIfTI 뷰어를 통해 관심 영역(ROI) 마스크를 생성하고 다운로드
4. **리포트 제공**: Client 작업 완료 후 Staff가 리포트를 생성하여 제공
5. **감사 추적**: 주요 액션 전체를 감사 로그로 기록하여 의료 데이터 처리 이력 유지

### 사용자 유형 비교

| 항목 | Staff | Client |
|------|-------|--------|
| **역할** | 업무 조율 / 배정자 | 실무 담당자 / 분석가 |
| **업무 시작점** | 외부 의뢰(S3 이벤트 등) 수신 및 검토 | Staff로부터 업무 배정 수신 |
| **주요 작업** | 케이스 검토, Client에게 업무 배정, 사용자 승인 | NIfTI 마스킹·분석 수행, 파일 업로드, 결과 제출 |
| **접근 범위** | 전체 케이스·업무·사용자·S3 알림 조회·수정 | 본인에게 배정된 업무 및 본인 파일만 |
| **사용 페이지** | `/admin/*` | `/client/*` |
| **가입** | 기존 Staff 승인 필요 (`staff_signup_requests`) | 즉시 가입 가능 |

---

## 2. 전체 시스템 구성도

```
┌─────────────────────────────────────────────────────────────┐
│                        클라이언트 브라우저                      │
│         (React 19 + Next.js App Router + Tailwind CSS)       │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Nginx (리버스 프록시)                       │
│   client_max_body_size 500M / proxy_pass localhost:3000      │
│   X-Real-IP, X-Forwarded-For 헤더 전달                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js 16 Application (PM2, Port 3000)         │
│                                                              │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │   App Router    │    │        API Routes             │    │
│  │  app/admin/     │    │  app/api/auth/                │    │
│  │  app/client/    │    │  app/api/tasks/               │    │
│  │  app/auth/      │    │  app/api/storage/             │    │
│  └─────────────────┘    │  app/api/reports/             │    │
│                         │  app/api/s3-updates/          │    │
│  ┌─────────────────┐    │  app/api/profiles/            │    │
│  │  lib/auth/      │    │  app/api/analytics/           │    │
│  │  getCurrentUser │    │  app/api/spreadsheet/         │    │
│  │  requireRole    │    └──────────────────────────────┘     │
│  └─────────────────┘                                         │
└──────────┬─────────────────────────────┬────────────────────┘
           │                             │
           ▼                             ▼
┌──────────────────────┐    ┌───────────────────────────────┐
│  AWS Aurora MySQL    │    │         AWS S3                 │
│  (ap-northeast-2)    │    │  DICOM/NIfTI 파일               │
│                      │    │  리포트 파일                     │
│  16개 테이블           │    │  업무 첨부파일 (7일 만료)         │
│  (schema.sql 참조)    │    └───────────────────────────────┘
└──────────────────────┘
           │
           ▼
┌──────────────────────┐
│  AWS Secrets Manager │
│  DB 비밀번호 자동 로테이션│
└──────────────────────┘
```

**외부 연동**

```
외부 시스템 (Lambda 등)
    │
    │ S3 파일 업로드 이벤트
    ▼
s3_updates 테이블 (알림 수신)
    │
    │ Staff가 담당자 지정
    ▼
task_assignments 생성
```

---

## 3. 기술 스택 및 선택 이유

### Next.js 16 (App Router)

**선택 이유**: 프론트엔드와 백엔드 API를 단일 레포지토리에서 관리할 수 있어 소규모 팀의 운영 복잡도를 최소화합니다. App Router의 서버 컴포넌트를 활용하면 민감 데이터(환자 정보)를 서버에서만 처리하고 클라이언트에 노출하지 않을 수 있습니다.

**대안 비교**

| 항목 | Next.js 16 ✅ | Express + React | Remix |
|------|-------------|----------------|-------|
| 프론트·백 통합 | 단일 레포, 단일 배포 | 레포·배포 분리 필요 | 단일 레포 가능 |
| 서버 컴포넌트 (PHI 보호) | ✅ App Router 기본 지원 | ❌ 없음 | ✅ 지원 |
| 대용량 파일 업로드 설정 | `bodySizeLimit` 한 줄 설정 | `multer` 등 별도 미들웨어 | 별도 구성 필요 |
| 소규모 단일 서버 배포 | ✅ PM2 + Node 그대로 사용 | ✅ 가능 | ✅ 가능 |
| 생태계·레퍼런스 | 매우 넓음 | 넓음 | 좁음 |

설정 파일: `next.config.mjs`

### TypeScript 5

**선택 이유**: 의료 데이터를 다루는 시스템에서 런타임 타입 오류는 심각한 결과를 초래할 수 있습니다. TypeScript의 정적 타입 검사로 환자 데이터 필드 오용, API 응답 타입 불일치 등의 오류를 컴파일 타임에 사전 방지합니다.

**대안 비교**

| 항목 | TypeScript 5 ✅ | JavaScript (JSDoc) | Flow |
|------|---------------|-------------------|------|
| 컴파일 타임 오류 검출 | ✅ 완전한 정적 타입 | ⚠️ 주석 기반, IDE 의존 | ✅ 정적 타입 |
| Next.js 공식 지원 | ✅ 1급 지원 | ✅ 지원 | ⚠️ 비공식 |
| 팀 채택률 | 업계 표준 | 점차 감소 | 사실상 deprecated |

### React 19 + Tailwind CSS 4 + shadcn/ui

**선택 이유**: shadcn/ui는 Radix UI 기반의 접근성(a11y) 준수 컴포넌트를 제공하며, 소스 코드를 직접 프로젝트에 포함시키는 방식이므로 라이선스 및 공급망 보안 측면에서 유리합니다. Tailwind CSS 4는 빌드 시점에 미사용 스타일을 제거하여 번들 크기를 최소화합니다.

**대안 비교**

| 항목 | shadcn/ui + Tailwind ✅ | Material UI (MUI) | Ant Design |
|------|----------------------|------------------|-----------|
| 컴포넌트 소유권 | ✅ 소스 코드 직접 포함 | npm 패키지 의존 | npm 패키지 의존 |
| 공급망 보안 | ✅ 의존성 최소화 | 패키지 업데이트 영향 | 패키지 업데이트 영향 |
| 접근성 (a11y) | ✅ Radix UI 기반 | ✅ 준수 | ⚠️ 일부 미흡 |
| 번들 크기 | ✅ 사용한 컴포넌트만 포함 | 전체 라이브러리 로드 | 전체 라이브러리 로드 |
| 디자인 자유도 | ✅ Tailwind로 자유 조합 | Material Design 고정 | Ant 디자인 고정 |

### AWS Aurora MySQL (mysql2)

**선택 이유**: Aurora MySQL은 표준 MySQL과 완전 호환되면서 자동 백업, Multi-AZ 장애 복구, 자동 스케일링을 제공합니다. AWS Secrets Manager와 네이티브 연동으로 DB 비밀번호 자동 로테이션이 가능하여 자격 증명 보안을 강화합니다.

**대안 비교**

| 항목 | Aurora MySQL ✅ | RDS PostgreSQL | MongoDB Atlas |
|------|---------------|---------------|--------------|
| MySQL 호환성 | ✅ 완전 호환 | ❌ SQL 방언 차이 | ❌ NoSQL |
| AWS Secrets Manager 연동 | ✅ 네이티브 자동 로테이션 | ✅ 가능 | ⚠️ 별도 구성 |
| 자동 스토리지 확장 | ✅ 10 GB → 128 TiB 자동 | ⚠️ 수동 또는 gp3 설정 | ✅ 자동 |
| 관계형 데이터 (JOIN) | ✅ 외래 키, 트랜잭션 완전 지원 | ✅ 더 강력한 JOIN | ❌ 부적합 |
| 기존 팀 친숙도 | MySQL 지식 재사용 | 추가 학습 필요 | 별도 패러다임 |

연결 구현: `lib/database/mysql.ts`

### AWS S3

**선택 이유**: 수백 MB에 달하는 DICOM/NIfTI 파일의 내구성 있는 저장이 필요합니다. S3는 99.999999999%(11 9s) 내구성, 서버 측 암호화(SSE), presigned URL을 통한 시간 제한 접근 제어를 제공합니다.

**대안 비교**

| 항목 | AWS S3 ✅ | EC2 로컬 디스크 | NAS / 자체 서버 |
|------|----------|--------------|--------------|
| 내구성 | ✅ 99.999999999% (11 9s) | ❌ 단일 디스크 장애 위험 | ⚠️ RAID 구성 필요 |
| 용량 한계 | ✅ 사실상 무제한 | EC2 EBS 용량 한정 | 물리 용량 한정 |
| 서버 부하 | ✅ Presigned URL로 클라이언트↔S3 직접 전송 | ❌ 서버 경유 | ❌ 서버 경유 |
| 암호화 | ✅ SSE 기본 제공 | 별도 설정 필요 | 별도 설정 필요 |
| AWS 서비스 연동 | ✅ Lambda, EventBridge 네이티브 | 별도 구현 | 불가 |
| 비용 | $0.023/GB/월 | EBS $0.08–0.125/GB/월 | 초기 구매 비용 |

구현: `lib/services/aws/s3.ts`

### JWT + bcryptjs (인증)

**선택 이유**: 외부 세션 저장소(Redis 등) 없이 stateless 인증을 구현합니다. 토큰은 HttpOnly 쿠키(`auth-token`)에 저장하여 XSS 공격으로부터 보호합니다. 비밀번호는 bcryptjs cost factor 10으로 해싱하여 저장합니다.

**대안 비교**

| 항목 | JWT + bcryptjs ✅ | NextAuth.js | 세션 기반 (Redis) |
|------|----------------|------------|----------------|
| 외부 인프라 의존 | ✅ 없음 (stateless) | ⚠️ DB 어댑터 또는 Redis 필요 | ❌ Redis 필수 |
| 소셜 로그인 | ❌ 직접 구현 필요 | ✅ OAuth 내장 | ✅ 가능 |
| 토큰 즉시 무효화 | ❌ 만료 전까지 유효 (7일) | ✅ DB 세션 삭제로 즉시 무효화 | ✅ 즉시 무효화 |
| XSS 방어 | ✅ HttpOnly 쿠키 | ✅ HttpOnly 쿠키 | ✅ HttpOnly 쿠키 |
| 서버 확장성 | ✅ 세션 공유 불필요 | ⚠️ DB 의존 | ❌ Redis 클러스터 필요 |

> 현재 소셜 로그인 요건이 없고 단일 서버 운영 환경이므로 JWT 방식이 적합합니다. 토큰 즉시 무효화가 필요해지면 DB 토큰 블랙리스트 추가 또는 NextAuth.js 전환을 검토합니다.

구현: `lib/auth/index.ts`, `lib/database/auth.ts`

### nifti-reader-js + fflate (의료 영상 처리)

**선택 이유**: NIfTI-1/NIfTI-2 표준 포맷을 브라우저에서 직접 파싱합니다. fflate는 순수 JavaScript GZIP 해제 라이브러리로 `.nii.gz` 파일을 서버 왕복 없이 클라이언트에서 처리합니다.

**대안 비교**

| 항목 | nifti-reader-js + fflate ✅ | 서버 사이드 파싱 (nibabel) | ITK-WASM |
|------|--------------------------|--------------------------|---------|
| 처리 위치 | ✅ 클라이언트 브라우저 | 서버 | ✅ 클라이언트 (WASM) |
| 서버 부하 | ✅ 없음 | ❌ 대용량 파일 서버 전송 | ✅ 없음 |
| 번들 크기 | ✅ 경량 | — | ❌ WASM 바이너리 수 MB |
| 환자 데이터 서버 전송 | ✅ 불필요 (PHI 보호) | ❌ 서버로 전송 필요 | ✅ 불필요 |

구현: `components/masking/niftiLoader.ts`

### PM2

**선택 이유**: Node.js 프로세스 자동 재시작, 메모리 상한(1GB) 초과 시 재시작, 로그 관리를 제공합니다.

**대안 비교**

| 항목 | PM2 ✅ | Docker | systemd |
|------|-------|--------|--------|
| Node.js 특화 기능 | ✅ cluster mode, 메모리 상한 재시작 | ❌ 별도 구성 | ❌ 별도 구성 |
| 설정 복잡도 | 낮음 (`ecosystem.config.js`) | 높음 (Dockerfile, Compose) | 중간 |
| 무중단 재시작 | ✅ `pm2 reload` | ✅ Rolling update | ⚠️ 서비스 재시작 |
| 소규모 단일 서버 적합성 | ✅ 최적 | ⚠️ 오버엔지니어링 | ⚠️ Node.js 특화 기능 부재 |

### Nginx

**선택 이유**: `client_max_body_size 500M` 설정으로 대용량 파일 업로드를 허용하며, `proxy_request_buffering off`로 파일 스트리밍을 지원합니다.

**대안 비교**

| 항목 | Nginx ✅ | Apache | Caddy |
|------|--------|--------|-------|
| 대용량 파일 업로드 설정 | ✅ `client_max_body_size` 단순 설정 | `LimitRequestBody` | ✅ 설정 가능 |
| 리버스 프록시 성능 | ✅ 이벤트 기반, 고성능 | 프로세스 기반, 상대적 낮음 | ✅ 고성능 |
| SSL 자동화 | Certbot 연동 | Certbot 연동 | ✅ Let's Encrypt 자동 내장 |
| 운영 레퍼런스 | ✅ 매우 풍부 | 풍부 | 비교적 적음 |

설정: `nginx/flonics-dashboard.conf`

---

## 4. 디렉토리 구조

```
dashboard_v2/
│
├── app/                          # Next.js App Router
│   ├── api/                      # REST API 엔드포인트
│   │   ├── auth/                 # signin, signup, signout, me
│   │   ├── tasks/                # 업무 CRUD, 세부업무, 댓글, 캘린더
│   │   ├── storage/              # 파일 업로드/다운로드/삭제/압축 해제
│   │   ├── s3-updates/           # S3 이벤트 알림 관리
│   │   ├── reports/              # 리포트 생성/조회/내보내기
│   │   ├── profiles/             # 사용자 프로필 관리
│   │   ├── notifications/        # Staff 가입 승인/거절
│   │   ├── analytics/            # 통계 대시보드
│   │   ├── holidays/             # 한국 공휴일 조회
│   │   ├── excel/                # 엑셀 파일 파싱
│   │   └── spreadsheet/          # 인앱 스프레드시트 CRUD
│   │
│   ├── admin/                    # Staff 전용 페이지
│   │   ├── cases/                # 케이스 목록 및 상세
│   │   ├── calendar/             # 업무 캘린더
│   │   ├── reports/              # 리포트 관리
│   │   ├── analytics/            # 통계/분석
│   │   ├── users/                # 사용자 관리, Staff 승인
│   │   ├── progress/             # 업무 진행 현황
│   │   ├── upload/               # 파일 업로드
│   │   ├── segmentation/         # 영상 세그멘테이션
│   │   ├── excel/                # 엑셀 처리
│   │   └── spreadsheet/          # 인앱 스프레드시트
│   │
│   ├── client/                   # Client 전용 페이지
│   │   ├── progress/             # 케이스 진행 현황
│   │   ├── reports/              # 리포트 열람
│   │   ├── upload/               # 파일 업로드
│   │   ├── masking/              # NIfTI 마스킹 뷰어
│   │   ├── excel/                # 엑셀 처리
│   │   └── analytics/            # 통계 조회
│   │
│   └── auth/                     # 인증 페이지 (login, signup)
│
├── components/                   # 재사용 UI 컴포넌트
│   ├── ui/                       # shadcn/ui 기반 컴포넌트
│   ├── masking/                  # NIfTI 뷰어 및 마스킹 에디터
│   │   ├── niftiLoader.ts        # NIfTI 파싱, 슬라이스 추출, 마스크 생성
│   │   ├── MaskingCanvas.tsx     # 캔버스 기반 마스킹 편집기
│   │   └── SlicePanel.tsx        # 슬라이스 뷰어 패널
│   ├── task/                     # 업무 관련 컴포넌트
│   └── calendar/                 # 캘린더 컴포넌트
│
├── lib/                          # 서버 사이드 유틸리티
│   ├── auth/index.ts             # getCurrentUser, requireAuth, requireRole
│   ├── database/
│   │   ├── mysql.ts              # DB 연결 풀, query(), queryOne()
│   │   └── auth.ts               # verifyToken, getUserById
│   ├── db/
│   │   └── audit.ts              # writeAuditLog()
│   ├── aws/
│   │   └── secrets.ts            # AWS Secrets Manager DB 비밀번호 조회
│   ├── services/aws/
│   │   └── s3.ts                 # S3 업로드/다운로드/삭제/목록
│   ├── middleware/
│   │   └── rate-limit.ts         # Rate Limiter
│   ├── constants/
│   │   └── dicomTags.ts          # 21개 DICOM 태그 상수
│   ├── archive/                  # ZIP/7z 압축 해제
│   ├── hooks/                    # 커스텀 React 훅
│   ├── utils/                    # 날짜, 파일 키, S3, 다운로드 유틸
│   └── types/                    # 전체 도메인 TypeScript 타입
│
├── scripts/
│   ├── schema.sql                # 전체 DB 스키마 (16개 테이블)
│   └── migrations/               # 점진적 마이그레이션 SQL
│
├── nginx/
│   └── flonics-dashboard.conf    # Nginx 설정
│
├── docs/                         # 프로젝트 문서
├── ecosystem.config.js           # PM2 설정
├── server.js                     # 커스텀 Next.js 서버 진입점
├── next.config.mjs               # Next.js 설정
└── package.json
```

---

## 5. 데이터 흐름

### 5.1 핵심 업무 워크플로우

```
┌────────────────────────────────────────────────────────────────────┐
│                     전체 업무 흐름                                    │
├─────────────────┬──────────────────────────────────────────────────┤
│   STAFF 역할    │   CLIENT 역할                                       │
├─────────────────┼──────────────────────────────────────────────────┤
│ ① 외부 의뢰 수신│                                                     │
│   S3 이벤트     │                                                     │
│   알림 확인     │                                                     │
│       ↓         │                                                     │
│ ② 업무 내용     │                                                     │
│   검토 및       │                                                     │
│   Client 선정   │                                                     │
│       ↓         │                                                     │
│ ③ 업무 배정     │ ④ 업무 수신 (task_assignments)                      │
│   POST /tasks   │        ↓                                            │
│                 │ ⑤ 파일 다운로드 (presigned URL)                     │
│                 │        ↓                                            │
│                 │ ⑥ NIfTI 마스킹 / 분석 수행                          │
│                 │        ↓                                            │
│                 │ ⑦ 결과 파일 업로드 + 상태 변경                       │
│       ↓         │        ↓                                            │
│ ⑧ 결과 확인 및  │                                                     │
│   리포트 생성   │                                                     │
└─────────────────┴──────────────────────────────────────────────────┘
```

### 5.2 파일 업로드 흐름 (Client)

```
Client 브라우저
    │  multipart/form-data (최대 500MB)
    ▼
POST /api/storage/upload
    │  1. requireAuth() — JWT 쿠키 검증
    │  2. S3 업로드 (lib/services/aws/s3.ts)
    │  3. user_files 테이블에 행 삽입
    │  4. writeAuditLog() — 업로드 기록
    ▼
응답: { fileId, s3Key, signedUrl }
```

### 5.3 S3 이벤트 → Staff 검토 → Client 배정 흐름

```
외부 시스템 (Lambda/S3 Event Notification)
    │  s3_updates 테이블 삽입
    ▼
[Staff] Admin 페이지 (/admin/cases)
    │  GET /api/s3-updates — 미처리 알림 목록 조회
    │  업무 내용 검토 → Client 배정 결정
    ▼
[Staff] Client에게 업무 배정
    │  PATCH /api/s3-updates/[id]
    │  → task_assignments 행 생성
    │  → s3_updates.task_id 업데이트
    ▼
[Client] 업무 화면 (/client/*)
    │  배정받은 업무 확인 → 마스킹/분석 수행
    │  PATCH /api/tasks/[id] → 상태 변경
    │  → task_status_history 자동 기록
    ▼
[Staff] 결과 확인 및 리포트 생성
    │  POST /api/tasks/[id]/create-report
```

---

## 6. 요청 처리 흐름

모든 API 요청의 공통 처리 순서:

```
HTTP 요청
    │
    ▼
Nginx (X-Forwarded-For 헤더 추가)
    │
    ▼
Next.js API Route Handler
    │
    ├── 1. Rate Limit 검사
    │       authRateLimiter: 5분/10회 (인증 엔드포인트)
    │       apiRateLimiter:  15분/100회 (일반 엔드포인트)
    │       초과 시: HTTP 429 Too Many Requests
    │
    ├── 2. JWT 인증 (requireAuth 또는 requireRole)
    │       auth-token 쿠키 → verifyJWT() → getUserById()
    │       실패 시: HTTP 401 Unauthorized
    │
    ├── 3. 역할 권한 확인
    │       requireRole('staff') 또는 클라이언트 본인 리소스 검증
    │       실패 시: HTTP 403 Forbidden
    │
    ├── 4. 비즈니스 로직 실행
    │       DB 쿼리 (lib/database/mysql.ts)
    │       S3 작업 (lib/services/aws/s3.ts)
    │
    ├── 5. 감사 로그 기록 (writeAuditLog — best-effort)
    │
    └── 6. 응답 반환 (JSON)
```

---

## 핵심 파일 우선 탐색 순서

| 단계 | 파일 | 이유 |
|------|------|------|
| **1** | `lib/database/mysql.ts` | 모든 DB 쿼리가 이 파일의 `query()` / `queryOne()`을 통해 실행됨 |
| **2** | `lib/database/auth.ts` | JWT 발급·검증·bcrypt 해싱 — 인증의 뼈대 |
| **3** | `lib/auth/index.ts` | `requireAuth()`, `requireRole()` — 모든 API에서 호출되는 인증 미들웨어 |
| **4** | `app/api/auth/signin/route.ts` | 로그인 API — Rate Limit, 감사 로그, 쿠키 발급 전체 흐름 |
| **5** | `app/api/tasks/route.ts` | 업무 목록 API — 역할별 분기·쿼리 패턴의 표준 예시 |
| **6** | `lib/services/aws/s3.ts` | S3 업로드·다운로드·Presigned URL 생성 |
| **7** | `components/masking/niftiLoader.ts` | NIfTI 파싱·슬라이스 추출·마스크 생성 — 의료 영상 핵심 |

### 패턴 이해: 일반적인 API Route 구조

```typescript
export async function GET(request: NextRequest) {
  // 1. 인증 검증
  const user = await requireRole('staff')

  // 2. 요청 파라미터 파싱
  const { searchParams } = new URL(request.url)

  // 3. DB 쿼리 (Prepared Statement)
  const rows = await query('SELECT * FROM cases WHERE assigned_to = ?', [user.id])

  // 4. 감사 로그 (주요 액션만)
  await writeAuditLog({ request, userId: user.id, action: 'cases.list', details: {} })

  // 5. 응답
  return NextResponse.json({ data: rows })
}
```

### 역할별 코드 분기 패턴

```typescript
let sql = 'SELECT * FROM task_assignments WHERE 1=1'
const params: unknown[] = []

if (user.role === 'client') {
  sql += ' AND assigned_to = ?'
  params.push(user.id)
}
// staff는 WHERE 절 추가 없이 전체 조회
```

### 자주 쓰는 개발 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 시작 (http://localhost:3000) |
| `npm run build` | 프로덕션 빌드 |
| `npm run tsc` | TypeScript 타입 오류 확인 |
| `npm run lint` | ESLint 실행 |
| `npm test` | Jest 단위 테스트 |
| `pm2 logs flonics-dashboard` | 프로덕션 로그 실시간 확인 |
