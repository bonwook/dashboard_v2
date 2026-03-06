# 보안 설계

## 목차

- [1. 인증 (Authentication)](#1-인증-authentication)
- [2. 인가 (Authorization / RBAC)](#2-인가-authorization--rbac)
- [3. Rate Limiting (무차별 대입 공격 방어)](#3-rate-limiting-무차별-대입-공격-방어)
- [4. SQL Injection 방지](#4-sql-injection-방지)
- [5. XSS 방어](#5-xss-방어)
- [6. 파일 업로드 보안](#6-파일-업로드-보안)
- [7. PHI 보호 (환자 정보)](#7-phi-보호-환자-정보)
- [8. AWS 인프라 보안](#8-aws-인프라-보안)
- [9. 감사 로그 (Audit Log)](#9-감사-로그-audit-log)
- [10. 보안 체크리스트](#10-보안-체크리스트)

---

## 1. 인증 (Authentication)

### JWT + HttpOnly 쿠키

```
로그인 요청 (email + password)
    │
    ▼
bcryptjs.compare(입력 비밀번호, DB hash) — cost factor 10
    │
    ▼ 일치
JWT 생성 (jose, HS256)
  payload: { id, email, role }
  만료: 7일
    │
    ▼
Set-Cookie: auth-token=<JWT>; HttpOnly; Secure; SameSite=Strict; Path=/
```

### 쿠키 보안 설정 이유

| 속성 | 설정값 | 효과 |
|------|--------|------|
| `HttpOnly` | true | JavaScript `document.cookie` 접근 차단 → XSS 토큰 탈취 방지 |
| `Secure` | true (production) | HTTPS 전송만 허용 |
| `SameSite` | Strict | CSRF 공격 방지 |
| `Path` | `/` | 전체 경로에서 쿠키 전송 |

### 구현 파일

- `lib/database/auth.ts` — `hashPassword()`, `verifyPassword()`, `generateToken()`, `verifyToken()`
- `lib/auth/index.ts` — `requireAuth()`, `requireRole()`

---

## 2. 인가 (Authorization / RBAC)

### 역할 체계

| 역할 | 설명 | DB 값 |
|------|------|-------|
| **staff** | 업무 조율·배정자. 전체 케이스·업무·사용자에 접근. Staff 가입 승인/거절 가능. | `'staff'` |
| **client** | 실무 담당자. 본인에게 배정된 업무와 본인 파일에만 접근. | `'client'` |

### API 권한 매트릭스

| 기능 | Staff | Client | 비인증 |
|------|-------|--------|--------|
| 전체 업무 목록 | ✅ | ❌ (본인만) | ❌ |
| 업무 생성 | ✅ | ❌ | ❌ |
| 업무 상태 변경 | ✅ | ✅ (본인 업무만) | ❌ |
| 전체 사용자 목록 | ✅ | ❌ | ❌ |
| 역할 변경 | ✅ | ❌ | ❌ |
| Staff 가입 승인/거절 | ✅ | ❌ | ❌ |
| S3 업데이트 알림 | ✅ | ❌ | ❌ |
| 파일 업로드 | ✅ | ✅ | ❌ |
| 본인 파일 다운로드 | ✅ | ✅ | ❌ |
| 타인 파일 접근 | ✅ | ❌ | ❌ |

### Client 데이터 격리 구현

Client는 본인 데이터만 볼 수 있도록 모든 쿼리에 `user_id` 필터를 강제합니다.

```typescript
// lib/auth/index.ts 패턴
export async function requireRole(role: 'staff' | 'client') {
  const user = await requireAuth()
  if (user.role !== role && !(role === 'client' && user.role === 'staff')) {
    throw new Response(null, { status: 403 })
  }
  return user
}

// API Route 패턴 — Client 데이터 격리
let sql = 'SELECT * FROM task_assignments WHERE 1=1'
const params: unknown[] = []

if (user.role === 'client') {
  sql += ' AND assigned_to = ?'  // Client는 본인 업무만
  params.push(user.id)
}
```

---

## 3. Rate Limiting (무차별 대입 공격 방어)

구현: `lib/middleware/rate-limit.ts`

| 대상 | 윈도우 | 최대 요청 수 | 효과 |
|------|--------|------------|------|
| `/api/auth/signin` | 5분 | 10회 | 비밀번호 무차별 대입 차단 |
| `/api/auth/signup` | 5분 | 10회 | 스팸 계정 생성 방지 |
| 일반 API | 15분 | 100회 | API 남용 방지 |

```typescript
// 인증 엔드포인트 적용 예시
const limiter = rateLimit({ windowMs: 5 * 60 * 1000, maxRequests: 10 })

const rateLimitResult = limiter(request)
if (!rateLimitResult.success) {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
}
```

> **현재 한계**: In-memory 저장소 사용. 서버 재시작 시 카운터 초기화, 다중 인스턴스 환경 비적합.
> 프로덕션 트래픽 증가 시 Redis 기반 Rate Limiter (예: `ioredis` + sliding window) 전환 권장.

---

## 4. SQL Injection 방지

### Prepared Statement 전용

`lib/database/mysql.ts`의 `query()` 함수는 항상 파라미터 바인딩을 사용합니다.

```typescript
// ✅ 올바른 사용 (Prepared Statement)
await query('SELECT * FROM profiles WHERE email = ?', [email])
await query('SELECT * FROM cases WHERE id = ? AND client_id = ?', [caseId, userId])

// ❌ 절대 금지 (문자열 보간)
await query(`SELECT * FROM profiles WHERE email = '${email}'`)
```

mysql2의 `pool.execute()` 메서드는 서버 사이드 Prepared Statement를 사용하므로 파라미터가 쿼리와 분리됩니다.

### 동적 쿼리 예외 처리

`ORDER BY` 컬럼명은 파라미터 바인딩이 불가하므로 화이트리스트로 제한합니다.

```typescript
const ALLOWED_SORT_COLUMNS = ['created_at', 'updated_at', 'title', 'status'] as const
const sortColumn = ALLOWED_SORT_COLUMNS.includes(requestedColumn) ? requestedColumn : 'created_at'
const sql = `SELECT * FROM tasks ORDER BY ${sortColumn} DESC`
```

---

## 5. XSS 방어

### 방어 계층

| 계층 | 방법 |
|------|------|
| **쿠키 보호** | HttpOnly 쿠키 → JavaScript 토큰 탈취 차단 |
| **HTML 렌더링** | `components/safe-html.tsx` — DOMPurify로 sanitize 후 렌더링 |
| **React 기본** | JSX의 자동 이스케이프 (`dangerouslySetInnerHTML` 미사용 원칙) |
| **CSP** | Next.js 응답 헤더에 Content-Security-Policy 설정 |

### 리포트 HTML 안전 렌더링

리포트는 Staff가 HTML 형식으로 작성합니다. 클라이언트 렌더링 시 XSS 방지를 위해 반드시 DOMPurify를 거칩니다.

```tsx
// components/safe-html.tsx
import DOMPurify from 'dompurify'

export function SafeHtml({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'table', 'tr', 'td', 'th'],
    ALLOWED_ATTR: ['class', 'style']
  })
  return <div dangerouslySetInnerHTML={{ __html: clean }} />
}
```

---

## 6. 파일 업로드 보안

| 보안 조치 | 구현 방법 |
|---------|---------|
| 파일 크기 제한 | Nginx `client_max_body_size 500M` + Next.js `bodySizeLimit: '500mb'` |
| S3 직접 업로드 | 서버를 경유하므로 사용자는 S3 자격 증명 불필요 |
| 파일 소유권 검증 | `user_files` 테이블의 `user_id` 검증 후 Presigned URL 발급 |
| 만료 URL | Presigned URL 유효시간 1시간, 업무 첨부파일 7일 후 만료 |
| 퍼블릭 접근 차단 | S3 버킷 퍼블릭 ACL 전체 차단 |

### 파일 접근 플로우

```
클라이언트 → POST /api/storage/signed-url?key=users/uuid/file.nii.gz
    │
    ▼
서버: user_files WHERE s3_key = ? AND user_id = ?  (소유권 검증)
    │
    ▼ 검증 성공
AWS SDK: s3.getSignedUrl('getObject', { Expires: 3600 })
    │
    ▼
클라이언트 → presigned URL로 S3에 직접 접근 (서버 미경유)
```

---

## 7. PHI 보호 (환자 정보)

PHI(Protected Health Information)는 환자 식별 가능 데이터를 말합니다.

### 현재 PHI 포함 필드

| 테이블 | 필드 | 설명 |
|--------|------|------|
| `cases` | `patient_name` | 환자명 |
| `cases` | `study_date` | 검사일 |
| `s3_updates` | `metadata` | DICOM 비PII 태그만 저장 (PatientName 등 PHI 필드는 제외) |

### PHI 보호 설계

| 원칙 | 구현 방식 |
|------|---------|
| **서버 사이드 처리** | 환자 정보는 Next.js 서버 컴포넌트에서만 처리. 클라이언트 번들에 포함 안 됨 |
| **클라이언트 사이드 파일 처리** | NIfTI 파일은 브라우저에서 직접 파싱 (서버 전송 불필요) |
| **최소 수집** | DICOM 메타데이터에서 PHI 필드는 저장 안 하고 비PII 태그만 추출 |
| **접근 제어** | `cases` 테이블 접근은 RBAC으로 제한 (client는 본인 케이스만) |
| **암호화 전송** | HTTPS 필수 (Nginx SSL + Certbot) |
| **암호화 저장** | Aurora 저장 시 암호화, S3 SSE 암호화 |

---

## 8. AWS 인프라 보안

| 항목 | 설정 |
|------|------|
| EC2 보안 그룹 | 인바운드: 80(HTTP), 443(HTTPS), 22(SSH — 관리 IP만) |
| RDS 보안 그룹 | 인바운드: 3306 — EC2 보안 그룹만 허용 (인터넷 차단) |
| S3 버킷 정책 | 퍼블릭 ACL 차단, IAM Role 통한 접근만 허용 |
| IAM Role | 최소 권한 (S3 특정 버킷, Secrets Manager 특정 ARN만) |
| DB 비밀번호 | Secrets Manager 자동 로테이션 (EC2에 평문 저장 금지) |
| .env 파일 | `.gitignore` 포함, 절대 커밋 금지 |

---

## 9. 감사 로그 (Audit Log)

구현: `lib/db/audit.ts` → `writeAuditLog()`

| 기록 대상 액션 | 예시 |
|-------------|------|
| 로그인 성공/실패 | `auth.signin.success`, `auth.signin.failure` |
| 파일 업로드/삭제 | `file.upload`, `file.delete` |
| 업무 상태 변경 | `task.status.change` |
| Staff 승인/거절 | `staff.approve`, `staff.reject` |
| 케이스 생성/수정 | `case.create`, `case.update` |

```typescript
// 사용 예시
await writeAuditLog({
  userId: user.id,
  caseId: caseId,          // 선택사항
  action: 'file.upload',
  details: { fileName, fileSize, s3Key }
})
```

> **best-effort 방식**: 감사 로그 기록 실패가 메인 비즈니스 로직을 중단시키지 않도록 try-catch로 처리합니다.

---

## 10. 보안 체크리스트

### 배포 전 필수 확인

- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는가
- [ ] `JWT_SECRET`이 충분히 강한 랜덤 값인가 (최소 256비트)
- [ ] AWS 자격 증명이 EC2 인스턴스 역할(IAM Role)로 설정되어 있는가 (액세스 키 파일 없음)
- [ ] Nginx SSL 설정이 올바른가 (`ssl_protocols TLSv1.2 TLSv1.3`)
- [ ] S3 버킷 퍼블릭 액세스 차단이 활성화되어 있는가
- [ ] RDS 보안 그룹이 EC2만 허용하는가
- [ ] Certbot 자동 갱신 cron이 설정되어 있는가

### 정기 점검 (월 1회)

- [ ] PM2 로그에서 비정상 패턴 확인
- [ ] CloudWatch에서 비정상 트래픽 확인
- [ ] AWS Secrets Manager 로테이션 성공 이력 확인
- [ ] audit_log 테이블에서 이상 액션 패턴 확인
