# Changelog

모든 주요 변경사항을 이 파일에 기록합니다.
[Semantic Versioning](https://semver.org/)을 따릅니다.

형식: `[버전] - YYYY-MM-DD`

---

## [Unreleased]

### Added
- 문서 전체 재작성 (`docs/` 폴더 — 11개 파일)
- CloudFront CDN 도입 검토 문서 추가 (`docs/09_INFRASTRUCTURE_COMPARISON.md`)
- S3 스토리지 클래스 비교 추가 (`docs/04_AWS_INFRASTRUCTURE.md`)
- 인증 문서 (PRD/SRS/SDS) 추가 (`docs/10_CERTIFICATION.md`)
- 기술 선택 비교 테이블 추가 (`docs/01_ARCHITECTURE.md`)

### Security
- 모든 문서에서 실제 인프라 식별자를 플레이스홀더로 교체

---

## [1.0.0] - 2025-02-25

### Added
- 초기 릴리스
- Next.js 16 App Router 기반 대시보드
- JWT + bcryptjs 인증 시스템
- RBAC (Staff / Client 역할 분리)
- AWS Aurora MySQL 연동 (Secrets Manager 자동 로테이션)
- AWS S3 파일 업로드·다운로드 (Presigned URL)
- NIfTI 마스킹 뷰어 (nifti-reader-js + fflate)
- 업무 관리 (배정·세부업무·댓글·상태 이력)
- 업무 첨부파일 7일 만료 정책
- S3 이벤트 알림 → 업무 연결 플로우
- 리포트 생성·열람·내보내기
- 인앱 스프레드시트 (폴더 계층 + CSV/Excel)
- 통계 대시보드
- 캘린더 뷰
- Staff 가입 승인·거절 플로우
- Rate Limiting (인증 5분/10회, 일반 15분/100회)
- 감사 로그 (`audit_log` 테이블)
- PM2 + Nginx 프로덕션 배포 구성
- IEC 62304 Class B 소프트웨어 분류
