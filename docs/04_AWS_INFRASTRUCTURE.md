# AWS 인프라

## 목차

- [1. 전체 AWS 구성 개요](#1-전체-aws-구성-개요)
- [2. EC2 (애플리케이션 서버)](#2-ec2-애플리케이션-서버)
- [3. Aurora MySQL (RDS)](#3-aurora-mysql-rds)
- [4. AWS S3 (파일 스토리지)](#4-aws-s3-파일-스토리지)
- [5. AWS Secrets Manager (자격 증명 관리)](#5-aws-secrets-manager-자격-증명-관리)
- [6. IAM 설정](#6-iam-설정)
- [7. Route53 & ACM (도메인·SSL)](#7-route53--acm-도메인ssl)
- [8. 모니터링 및 알람](#8-모니터링-및-알람)

---

## 1. 전체 AWS 구성 개요

```
인터넷
  │ HTTPS
  ▼
Route53 (DNS: <your-domain>.com)
  │
  ▼
EC2 t3a.medium (ap-northeast-2)
  ├── Nginx (포트 80/443) ← Let's Encrypt SSL
  ├── Next.js / PM2 (포트 3000)
  └── IAM Role 연결 (S3·Secrets Manager 접근)
        │                     │
        ▼                     ▼
Aurora MySQL            AWS S3
(ap-northeast-2)        (<your-s3-bucket>)
  └── Secrets Manager 연동
      (비밀번호 자동 로테이션)
```

### 사용 AWS 서비스 요약

| 서비스 | 용도 | 비용 절감 이유 |
|--------|------|-------------|
| EC2 t3a.medium | Next.js 서버 실행 | ARM64 Graviton2 대비 저렴, 소규모 트래픽에 적합 |
| Aurora MySQL | 관계형 데이터베이스 | 자동 백업, Multi-AZ 포함 |
| S3 Standard | DICOM/NIfTI 파일 저장 | 11 9s 내구성, 소규모 트래픽 기준 무료 Tier 이내 |
| Secrets Manager | DB 비밀번호 자동 로테이션 | 보안 강화, 수동 관리 불필요 |
| Route53 | DNS | 도메인 레지스트라 통합 |
| ACM | SSL 인증서 (ALB 사용 시) | 무료 인증서 |

---

## 2. EC2 (애플리케이션 서버)

| 항목 | 값 |
|------|-----|
| 인스턴스 타입 | t3a.medium (x86, 2 vCPU, 4GB RAM) |
| OS | Amazon Linux 2023 |
| 리전 | ap-northeast-2 (서울) |
| 퍼블릭 IP | 탄력적 IP (Elastic IP) |
| 보안 그룹 | 인바운드 80(HTTP), 443(HTTPS), 22(SSH, 관리 IP 제한) |

### EC2 내 소프트웨어 스택

```
EC2 t3a.medium
├── Node.js 20 LTS
├── Next.js 16 (PM2로 실행)
│   └── 포트 3000
├── Nginx
│   ├── 포트 80 → 443 리다이렉트
│   └── 포트 443 → localhost:3000 프록시
└── Certbot (Let's Encrypt 인증서 자동 갱신)
```

### PM2 설정 요약 (`ecosystem.config.js`)

```javascript
{
  name: 'flonics-dashboard',
  script: 'server.js',
  instances: 1,
  max_memory_restart: '1G',
  env: {
    NODE_ENV: 'production',
    PORT: 3000
  }
}
```

---

## 3. Aurora MySQL (RDS)

| 항목 | 값 |
|------|-----|
| 엔진 | Aurora MySQL 8.0 |
| 인스턴스 클래스 | db.t4g.small (Graviton2 ARM64) |
| 리전 | ap-northeast-2 |
| 클러스터 엔드포인트 | `<your-cluster>.cluster-xxxx.ap-northeast-2.rds.amazonaws.com` |
| 데이터베이스명 | `<your_database_name>` |
| 백업 보존 기간 | 7일 (자동 스냅샷) |
| 암호화 | 저장 시 암호화 활성화 |
| 인증 | AWS Secrets Manager 연동 (비밀번호 자동 로테이션) |

### db.t4g.small 선택 이유

| 항목 | db.t4g.small | db.t3.small |
|------|-------------|------------|
| vCPU | 2 | 2 |
| RAM | 2 GiB | 2 GiB |
| 비용 (서울) | ~$0.041/시간 | ~$0.045/시간 |
| 아키텍처 | Graviton2 ARM64 | x86 |
| 최대 커넥션 | ~90개 | ~90개 |

→ 동일 스펙에서 ARM64 기반 Graviton2가 ~9% 저렴. Aurora MySQL 전용 최적화 적용.

### DB 연결 보안 아키텍처

```
EC2 (VPC 내 동일 서브넷)
  │  포트 3306 (DB 보안 그룹: EC2만 허용)
  ▼
Aurora MySQL
  └── Secrets Manager (비밀번호 자동 로테이션)
       └── EC2 IAM Role로 접근 (키 없이 자동 인증)
```

---

## 4. AWS S3 (파일 스토리지)

| 항목 | 값 |
|------|-----|
| 버킷명 | `<your-s3-bucket-name>` |
| 리전 | ap-northeast-2 (서울) |
| 현재 스토리지 클래스 | S3 Standard |
| 서버 측 암호화 | SSE-S3 (기본 활성화) |
| 퍼블릭 액세스 | 전체 차단 |
| 파일 접근 방식 | Presigned URL (시간 제한 접근) |

### S3 키 네이밍 규칙

```
users/{userId}/{uuid}/{filename}          # 사용자 파일
tasks/{taskId}/{uuid}/{filename}          # 업무 첨부파일 (7일 만료)
incoming/{filename}                        # S3 이벤트 알림 파일
reports/{reportId}/{uuid}/{filename}      # 리포트 파일
```

### S3 스토리지 클래스 비교

> **현재 상태**: 모든 파일에 S3 Standard 적용 (기본값, 별도 설정 없음).

S3는 파일 접근 빈도·보존 기간에 따라 스토리지 클래스를 선택해 비용을 최적화할 수 있습니다.

| 스토리지 클래스 | 용도 | GB당 월 비용 | 최소 보존 기간 | 조회 비용 |
|--------------|------|------------|------------|---------|
| **Standard** (현재) | 자주 접근하는 파일 | $0.023 | 없음 | 없음 |
| **Standard-IA** | 월 1회 이하 접근, 장기 보관 | $0.0125 | 30일 | $0.01/GB |
| **Intelligent-Tiering** | 접근 패턴 불규칙 | $0.023 → 자동 조정 | 없음 | 없음 (모니터링 $0.0025/1천 객체) |
| **Glacier Instant Retrieval** | 분기 1회 접근, 장기 아카이브 | $0.004 | 90일 | $0.03/GB |
| **Glacier Flexible Retrieval** | 연 1회 이하, 수 시간 내 복원 | $0.0036 | 90일 | $0.01/GB + 복원 3–5시간 |
| **Deep Archive** | 7년+ 장기 보존 규제 준수 | $0.00099 | 180일 | $0.02/GB + 복원 12시간 |

#### 파일 유형별 권장 스토리지 클래스

| 파일 유형 | 접근 패턴 | 현재 | 권장 전환 |
|---------|---------|------|---------|
| 진행 중 업무 DICOM/NIfTI | 배정 후 수일간 빈번히 접근 | Standard | **Standard 유지** |
| 완료된 케이스 파일 | 완료 후 거의 미접근 | Standard | **Standard-IA** (90일 후 전환) |
| 리포트 파일 | 열람 빈도 낮음, 장기 보존 | Standard | **Standard-IA** |
| 업무 첨부파일 | 7일 만료 정책 적용 | Standard | **Standard 유지** (단기 보관) |
| 장기 보존 의료 기록 (규제 요건) | 연 1회 이하 | Standard | **Glacier** (규제 준수 필요 시) |

#### S3 Lifecycle Policy 예시 (향후 적용 권고)

```json
{
  "Rules": [
    {
      "ID": "archive-completed-cases",
      "Filter": { "Prefix": "users/" },
      "Status": "Enabled",
      "Transitions": [
        { "Days": 90, "StorageClass": "STANDARD_IA" },
        { "Days": 365, "StorageClass": "GLACIER_IR" }
      ]
    },
    {
      "ID": "delete-expired-task-attachments",
      "Filter": { "Prefix": "tasks/" },
      "Status": "Enabled",
      "Expiration": { "Days": 7 }
    }
  ]
}
```

> **현재 적용하지 않는 이유**: 운영 초기로 파일 접근 패턴 데이터가 충분하지 않습니다. 6개월 이상 운영 후 CloudWatch S3 Storage Lens로 접근 빈도를 분석한 뒤 Lifecycle Policy를 적용하는 것을 권장합니다.

---

## 5. AWS Secrets Manager (자격 증명 관리)

| 항목 | 값 |
|------|-----|
| 시크릿 이름 | `rds!db-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| 시크릿 ARN | `arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:rds!db-xxxxxxxx-*` |
| 로테이션 주기 | 자동 (Aurora 네이티브 로테이션) |
| 접근 방식 | EC2 IAM Role (액세스 키 없음) |

### 비밀번호 자동 로테이션 흐름

```
Secrets Manager (자동 로테이션 실행)
  │
  ▼
새 비밀번호 → Aurora MySQL 적용
  │
  ▼
Next.js (mysql.ts): ER_ACCESS_DENIED_ERROR 감지
  │
  ▼
globalForPool 초기화 → Secrets Manager에서 새 비밀번호 재조회
  │
  ▼
새 연결 풀 생성 → 요청 재처리
```

`lib/aws/secrets.ts` 및 `lib/database/mysql.ts` 참조.

---

## 6. IAM 설정

### EC2 인스턴스 역할 정책

EC2에 IAM Role을 연결하여 AWS 자격 증명 키 없이 S3와 Secrets Manager에 접근합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::<your-s3-bucket-name>",
        "arn:aws:s3:::<your-s3-bucket-name>/*"
      ]
    },
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:rds!db-xxxxxxxx-*"
    }
  ]
}
```

### 최소 권한 원칙 적용

| 원칙 | 적용 방법 |
|------|---------|
| S3 접근 범위 제한 | 특정 버킷 ARN만 허용 (`arn:aws:s3:::<bucket>/*`) |
| Secrets Manager 범위 제한 | 특정 시크릿 ARN 패턴만 허용 |
| 키 없는 인증 | IAM Role 사용, 액세스 키 EC2 내 저장 금지 |
| DB 포트 제한 | RDS 보안 그룹: EC2 IP만 3306 허용 |

---

## 7. Route53 & ACM (도메인·SSL)

| 항목 | 값 |
|------|-----|
| 도메인 | `<your-domain>.com` |
| DNS 호스팅 영역 | AWS Route53 |
| SSL 인증서 방식 | Let's Encrypt (Nginx + Certbot) |
| 인증서 자동 갱신 | `certbot renew` cron 설정 |

> ACM 인증서는 ALB 도입 시 활용합니다. 현재는 EC2 직접 연결이므로 Let's Encrypt를 사용합니다.
> 비용 비교: [docs/09_INFRASTRUCTURE_COMPARISON.md](09_INFRASTRUCTURE_COMPARISON.md) HTTPS 구현 방식 비교 섹션 참조.

---

## 8. 모니터링 및 알람

| 서비스 | 모니터링 대상 | 설정 방법 |
|--------|------------|---------|
| CloudWatch | EC2 CPU, 메모리, 네트워크 | EC2 기본 메트릭 자동 수집 |
| CloudWatch Logs | Nginx 액세스·오류 로그 | CloudWatch Agent 설정 |
| RDS 이벤트 | Aurora 장애·재시작 알림 | RDS 이벤트 알림 구독 |
| PM2 | 프로세스 자동 재시작 | `max_memory_restart: '1G'` |

> 현재 CloudWatch 알람이 구성되어 있지 않습니다. CPU 사용률 80% 이상 시 SNS 이메일 알람 설정을 권장합니다.
