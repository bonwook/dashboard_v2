# 보안 정책

## 지원 버전

| 버전 | 지원 여부 |
|------|---------|
| 최신 버전 | ✅ 보안 패치 지원 |
| 이전 버전 | ❌ 지원 종료 |

## 보안 취약점 신고

### 신고 방법

보안 취약점을 발견하셨다면 **공개 GitHub Issue 대신** 아래 방법으로 신고해 주십시오.

1. **이메일**: 개발팀 내부 보안 담당자에게 직접 연락
2. **내용 포함 사항**:
   - 취약점 유형 및 위치
   - 재현 단계
   - 잠재적 영향 범위
   - 가능하다면 개선 제안

### 처리 절차

1. 신고 접수 후 **48시간 내** 확인 응답
2. 취약점 심각도 평가 (Critical / High / Medium / Low)
3. **Critical·High**: 7일 내 패치 목표
4. **Medium·Low**: 다음 정기 릴리스에 포함

## 보안 설계 원칙

이 프로젝트의 보안 설계에 대한 상세 내용은 [`docs/05_SECURITY.md`](docs/05_SECURITY.md)를 참조하십시오.

### 핵심 보안 조치 요약

- **인증**: JWT + HttpOnly 쿠키 (XSS 토큰 탈취 방지)
- **비밀번호**: bcryptjs cost 10 해싱
- **SQL Injection**: Prepared Statement 전용 (`lib/database/mysql.ts`)
- **XSS**: DOMPurify sanitize, HttpOnly 쿠키
- **RBAC**: Staff / Client 역할 분리, Client 데이터 격리
- **Rate Limiting**: 인증 API 5분/10회
- **PHI 보호**: 서버 컴포넌트에서만 환자 정보 처리
- **전송 암호화**: HTTPS 필수 (TLS 1.2/1.3)
- **저장 암호화**: Aurora 저장 시 암호화, S3 SSE
- **자격 증명 관리**: AWS Secrets Manager (DB 비밀번호 자동 로테이션)

## 알려진 한계

| 항목 | 현재 한계 | 개선 계획 |
|------|---------|---------|
| JWT 즉시 무효화 | 로그아웃 후 토큰 만료 전(7일) 재사용 가능 | DB 토큰 블랙리스트 또는 NextAuth 전환 |
| Rate Limiter 저장소 | In-memory (서버 재시작 시 초기화) | Redis 기반으로 전환 |
| 감사 로그 | best-effort (실패 시 main 로직 미중단) | 중요 액션은 트랜잭션으로 보장 |

## 의존성 보안

```bash
# 보안 취약점 확인
npm audit

# Critical·High 자동 수정 시도
npm audit fix
```

정기적으로 `npm audit`을 실행하여 의존성 취약점을 모니터링하십시오.
