# Flonics Dashboard

4D Flow MRI 의료 영상 분석 서비스의 운영 지원 웹 플랫폼입니다.
업무 배정, 파일 관리, NIfTI 마스킹, 리포트 제공을 하나의 앱에서 처리합니다.

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router), React 19 |
| 언어 | TypeScript 5 |
| 스타일링 | Tailwind CSS 4, shadcn/ui |
| 데이터베이스 | AWS Aurora MySQL (mysql2) |
| 파일 스토리지 | AWS S3 |
| 인증 | JWT + bcryptjs, HttpOnly 쿠키 |
| 의료 영상 | nifti-reader-js, fflate |
| 프로세스 관리 | PM2 |
| 웹 서버 | Nginx |

## 빠른 시작

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일에서 DB, S3, JWT 설정

# 개발 서버 시작
npm run dev
```

## 사용자 역할

- **Staff**: 업무 배정, 케이스 관리, 리포트 생성, 사용자 승인
- **Client**: 배정된 업무 수행, NIfTI 마스킹, 결과 업로드

## 문서

| 문서 | 내용 |
|------|------|
| [`docs/REPO_LOGIC.md`](docs/REPO_LOGIC.md) | 전체 레포 로직 요약 (빠른 이해) |
| [`docs/01_ARCHITECTURE.md`](docs/01_ARCHITECTURE.md) | 시스템 아키텍처 및 기술 선택 이유 |
| [`docs/02_DATABASE.md`](docs/02_DATABASE.md) | DB 스키마 및 테이블 설계 |
| [`docs/03_API.md`](docs/03_API.md) | API 레퍼런스 |
| [`docs/04_AWS_INFRASTRUCTURE.md`](docs/04_AWS_INFRASTRUCTURE.md) | AWS 인프라 구성 |
| [`docs/05_SECURITY.md`](docs/05_SECURITY.md) | 보안 설계 (인증·RBAC·PHI 보호) |
| [`docs/06_DEPLOYMENT.md`](docs/06_DEPLOYMENT.md) | 배포 가이드 및 환경 변수 |
| [`docs/07_MEDICAL_COMPLIANCE.md`](docs/07_MEDICAL_COMPLIANCE.md) | 의료 규제 준수 (IEC 62304, ISO 14971) |
| [`docs/08_FEATURES.md`](docs/08_FEATURES.md) | 주요 기능 명세 |
| [`docs/09_INFRASTRUCTURE_COMPARISON.md`](docs/09_INFRASTRUCTURE_COMPARISON.md) | 인프라 선택 비교 근거 |
| [`docs/10_CERTIFICATION.md`](docs/10_CERTIFICATION.md) | PRD / SRS / SDS 통합 인증 문서 |

## 개발 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 시작 |
| `npm run build` | 프로덕션 빌드 |
| `npm run tsc` | TypeScript 타입 검사 |
| `npm run lint` | ESLint 실행 |
| `npm test` | 단위 테스트 |

## 기여

[`CONTRIBUTING.md`](CONTRIBUTING.md) 참조.

## 보안 취약점 신고

[`SECURITY.md`](SECURITY.md) 참조.
