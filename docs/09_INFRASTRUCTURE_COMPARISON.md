# 인프라 선택 비교

> 이 문서는 인프라 구성 결정 시 비교 검토한 내용을 기록합니다.
> 각 항목에 대해 "왜 현재 방식을 선택했는가"를 명확히 남겨 향후 의사결정의 근거로 활용합니다.

## 목차

- [1. HTTPS 구현: Nginx + Let's Encrypt vs AWS ALB + ACM](#1-https-구현-nginx--lets-encrypt-vs-aws-alb--acm)
- [2. 서버 구성: 단일 EC2 vs 컨테이너 (ECS/EKS)](#2-서버-구성-단일-ec2-vs-컨테이너-ecse​ks)
- [3. DB 자격 증명: Secrets Manager vs 환경 변수](#3-db-자격-증명-secrets-manager-vs-환경-변수)
- [4. 파일 스토리지: S3 vs EBS](#4-파일-스토리지-s3-vs-ebs)
- [5. 프로세스 관리: PM2 vs Docker vs systemd](#5-프로세스-관리-pm2-vs-docker-vs-systemd)
- [6. DB 엔진: Aurora MySQL vs RDS MySQL vs PostgreSQL](#6-db-엔진-aurora-mysql-vs-rds-mysql-vs-postgresql)
- [7. 인증 방식: JWT vs NextAuth.js vs 세션 기반](#7-인증-방식-jwt-vs-nextauthjs-vs-세션-기반)
- [8. CloudFront CDN 도입 검토](#8-cloudfront-cdn-도입-검토)

---

## 1. HTTPS 구현: Nginx + Let's Encrypt vs AWS ALB + ACM

### 비용 비교 (월 기준, ap-northeast-2)

| 항목 | Nginx + Let's Encrypt ✅ | AWS ALB + ACM |
|------|------------------------|--------------|
| 인증서 비용 | 무료 (Let's Encrypt 90일 자동 갱신) | 무료 (ACM) |
| 로드밸런서 비용 | 없음 (EC2 Nginx 처리) | ALB: ~$16–25/월 (고정 + 트래픽) |
| SSL 종료 위치 | EC2 Nginx | ALB |
| 관리 복잡도 | Certbot cron 설정 | AWS 콘솔 설정 |
| 자동 갱신 | Certbot cron (30일 전 갱신) | ✅ ACM 자동 갱신 |
| Multi-AZ 가용성 | ❌ 단일 EC2 | ✅ Multi-AZ |
| 트래픽 급증 대응 | ❌ EC2 스케일업 수동 | ✅ 자동 확장 |
| CloudFront 연동 | 별도 설정 필요 | ✅ 자연스러운 연동 |

### 현재 선택: Nginx + Let's Encrypt

**이유**:
- 현재 단일 EC2 단일 인스턴스 운영 → ALB 고정 비용($16–25/월) 대비 효용 없음
- 트래픽 규모(30–50명 동시 사용)에서 ALB의 자동 확장 이점 미미
- 월 $16–25 절약

**ALB 전환 권장 시점**:

| 상황 | 권장 |
|------|------|
| 다중 EC2 인스턴스 운영 필요 시 | ✅ ALB 도입 |
| 동시 사용자 100명 초과, EC2 단일 인스턴스 병목 | ✅ ALB + Auto Scaling |
| Fargate/ECS 전환 시 | ✅ ALB 필수 |
| CloudFront + WAF 적용 시 | ✅ ALB 동시 도입 자연스러움 |

---

## 2. 서버 구성: 단일 EC2 vs 컨테이너 (ECS/EKS)

| 항목 | 단일 EC2 ✅ | ECS Fargate | EKS |
|------|-----------|------------|-----|
| 운영 복잡도 | 낮음 | 중간 | 높음 |
| 인프라 비용 | t3a.medium ~$33/월 | 동등 또는 더 높음 | 더 높음 (control plane $73/월) |
| 배포 방식 | git pull + pm2 reload | Docker 이미지 빌드·푸시·업데이트 | K8s 매니페스트 관리 |
| 롤백 | git checkout | 이전 태스크 정의로 롤백 | kubectl rollout undo |
| 장애 복구 | PM2 자동 재시작 | ✅ 컨테이너 자동 교체 | ✅ 파드 자동 교체 |
| 소규모 팀 적합성 | ✅ 최적 | ⚠️ Docker 지식 필요 | ❌ K8s 전문 지식 필요 |

**현재 선택**: 단일 EC2 + PM2. 소규모 팀, 단순한 배포 프로세스 우선.

**전환 권장 시점**:

| 상황 | 권장 |
|------|------|
| 서비스 확장으로 다중 인스턴스 필요 | ECS Fargate 검토 |
| Docker 기반 CI/CD 파이프라인 구성 시 | ECS 전환 |
| 마이크로서비스 아키텍처 전환 시 | EKS 검토 |

---

## 3. DB 자격 증명: Secrets Manager vs 환경 변수

| 항목 | Secrets Manager ✅ | .env 환경 변수 |
|------|------------------|--------------|
| 비밀번호 노출 위험 | ✅ EC2에 평문 저장 안 함 | ❌ .env 파일 유출 시 즉시 노출 |
| 자동 로테이션 | ✅ Aurora 네이티브 연동 | ❌ 수동 변경 + 서버 재배포 필요 |
| 접근 감사 | ✅ CloudTrail로 조회 이력 기록 | ❌ 없음 |
| 비용 | $0.40/시크릿/월 + $0.05/만 API 호출 | 무료 |
| 구현 복잡도 | IAM Role + SDK 코드 필요 | .env 파일만 수정 |

**현재 선택**: Secrets Manager 전용.

**이유**: DB 비밀번호가 EC2에 평문으로 저장되는 리스크 제거. 월 $0.40 비용은 의료 데이터 보안 대비 합리적.

---

## 4. 파일 스토리지: S3 vs EBS

| 항목 | S3 ✅ | EBS (EC2 로컬) |
|------|-------|--------------|
| 내구성 | 11 9s (99.999999999%) | 단일 가용 영역, 디스크 장애 위험 |
| 용량 한계 | 사실상 무제한 | EC2 인스턴스 타입별 제한 |
| 비용 | $0.023/GB/월 | $0.08–0.125/GB/월 (gp3 기준) |
| 서버 부하 | ✅ Presigned URL로 클라이언트↔S3 직접 | ❌ 모든 파일 I/O가 EC2 경유 |
| 다중 서버 공유 | ✅ 가능 | ❌ 단일 EC2에 종속 |
| AWS 서비스 연동 | ✅ Lambda 트리거, EventBridge 네이티브 | 불가 |

**현재 선택**: S3. 비용·내구성·서버 부하 모든 면에서 우위.

---

## 5. 프로세스 관리: PM2 vs Docker vs systemd

| 항목 | PM2 ✅ | Docker | systemd |
|------|-------|--------|--------|
| Node.js 특화 | ✅ cluster mode, 메모리 상한 재시작 | ❌ 별도 구성 필요 | ❌ 없음 |
| 설정 복잡도 | 낮음 | 높음 (Dockerfile, 레지스트리) | 중간 |
| 무중단 재시작 | ✅ `pm2 reload` | ✅ Rolling restart | ⚠️ 다운타임 발생 |
| 로그 관리 | ✅ pm2 logs | ✅ docker logs | journalctl |
| 소규모 단일 서버 | ✅ 최적 | ⚠️ 오버엔지니어링 | ⚠️ Node.js 기능 부재 |

**현재 선택**: PM2. Node.js 단일 서버 환경에서 최적.

---

## 6. DB 엔진: Aurora MySQL vs RDS MySQL vs PostgreSQL

| 항목 | Aurora MySQL ✅ | RDS MySQL | RDS PostgreSQL |
|------|---------------|-----------|---------------|
| MySQL 호환성 | ✅ 완전 호환 | ✅ 완전 호환 | ❌ SQL 방언 차이 |
| 자동 스토리지 확장 | ✅ 10 GB → 128 TiB 자동 | ⚠️ 수동 또는 gp3 | ⚠️ 수동 또는 gp3 |
| 장애 복구 시간 | ✅ ~30초 (Aurora 전용) | ~2분 (Multi-AZ) | ~2분 (Multi-AZ) |
| Graviton2 ARM64 지원 | ✅ db.t4g.* 시리즈 | ✅ db.t4g.* | ✅ db.t4g.* |
| 비용 (db.t4g.small) | ~$0.041/h | ~$0.034/h | ~$0.037/h |
| Secrets Manager 연동 | ✅ 네이티브 자동 로테이션 | ✅ | ✅ |

**현재 선택**: Aurora MySQL. 자동 스토리지 확장·빠른 장애 복구·MySQL 호환성 고려.

---

## 7. 인증 방식: JWT vs NextAuth.js vs 세션 기반

| 항목 | JWT + bcryptjs ✅ | NextAuth.js | 세션 기반 (Redis) |
|------|----------------|------------|----------------|
| 외부 인프라 의존 | ✅ 없음 | DB 어댑터 또는 Redis 필요 | ❌ Redis 필수 |
| 소셜 로그인 | ❌ 직접 구현 필요 | ✅ OAuth 내장 | ✅ 가능 |
| 토큰 즉시 무효화 | ❌ 만료 전까지 유효 (7일) | ✅ DB 세션 삭제 | ✅ Redis 키 삭제 |
| 서버 확장성 | ✅ 세션 공유 불필요 | ⚠️ DB 의존 | ❌ Redis 클러스터 |
| 구현 복잡도 | 낮음 (직접 제어) | 중간 (프레임워크 학습) | 높음 |

**현재 선택**: JWT + HttpOnly 쿠키.

**이유**: 소셜 로그인 요건 없음, Redis 추가 인프라 불필요, 단일 서버 환경에서 세션 공유 불필요.

**전환 권장 시점**: 소셜 로그인(카카오·구글 등) 요건 추가 시 NextAuth.js 전환 검토.

---

## 8. CloudFront CDN 도입 검토

> **현재 상태**: CloudFront 미사용. EC2 Nginx에서 정적 파일 직접 서빙.

CDN(Content Delivery Network)은 정적 파일(JS 번들, CSS, 이미지)을 사용자에게 가장 가까운 엣지 서버에서 전달하여 응답 속도를 개선하는 서비스입니다.

### 현재 구조 vs CloudFront 도입 비교

| 항목 | 현재 (EC2 직접 서빙) | CloudFront 도입 시 |
|------|-------------------|-----------------|
| 정적 파일 서빙 주체 | EC2 Nginx | CloudFront 엣지 (전 세계 400+ PoP) |
| EC2 트래픽 부하 | JS/CSS/이미지 요청 모두 EC2 경유 | 정적 파일은 CloudFront 캐시, EC2 부하 감소 |
| 응답 속도 | 서버 위치(서울)에 의존 | 사용자 가장 가까운 엣지에서 응답 |
| DDoS 방어 | ❌ 기본 없음 | ✅ AWS Shield Standard 자동 적용 |
| HTTPS 인증서 | Nginx + Let's Encrypt | ACM 인증서 CloudFront에 적용 |
| 월 추가 비용 | 없음 | ~$1–5 (소규모 트래픽 기준) |
| 설정 복잡도 | 없음 | 중간 (Origin 설정, 캐시 정책, 무효화 관리) |

### 도입이 필요 없는 이유 (현재)

| 항목 | 내용 |
|------|------|
| 국내 단일 리전 운영 | 사용자 대부분이 국내(서울 리전 인접) → 엣지 캐시 이점 미미 |
| 의료 파일은 CDN 대상 아님 | DICOM/NIfTI 파일은 Presigned URL로 S3에서 직접 전달. CDN을 거치지 않음 |
| 트래픽 규모 소규모 | 현재 30–50명 동시 사용 수준에서 EC2 정적 서빙 충분 |
| Next.js 빌드 캐시 헤더 | `_next/static/` 파일에 `Cache-Control: immutable` 자동 적용, 브라우저 캐싱으로 대체 가능 |

### 도입 권장 시점

| 상황 | 권장 |
|------|------|
| 해외 사용자 접속이 빈번해질 경우 | ✅ CloudFront 도입 |
| 동시 사용자 100명 이상, EC2 정적 서빙 병목 시 | ✅ CloudFront 도입 |
| ALB 전환 시 (Route53 + ACM 구성) | ✅ CloudFront 동시 도입 자연스러움 |
| 현재 소규모 국내 운영 | ⏸ 유지 (우선순위 낮음) |
