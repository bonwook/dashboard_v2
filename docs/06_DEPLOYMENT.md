# 배포 가이드

## 목차

- [1. 환경 변수 설정](#1-환경-변수-설정)
- [2. 로컬 개발 환경 설정](#2-로컬-개발-환경-설정)
- [3. 프로덕션 배포 절차](#3-프로덕션-배포-절차)
- [4. Nginx 설정](#4-nginx-설정)
- [5. SSL 인증서 (Let's Encrypt)](#5-ssl-인증서-lets-encrypt)
- [6. 데이터베이스 초기화](#6-데이터베이스-초기화)
- [7. PM2 관리 명령어](#7-pm2-관리-명령어)
- [8. 롤백 절차](#8-롤백-절차)
- [9. 트러블슈팅](#9-트러블슈팅)

---

## 1. 환경 변수 설정

`.env` 파일을 프로젝트 루트에 생성합니다. `.env.example`을 복사하여 시작합니다.

```bash
cp .env.example .env
```

### 필수 환경 변수

| 변수명 | 예시 | 설명 |
|--------|------|------|
| `DB_HOST` | `<your-cluster>.cluster-xxxx.ap-northeast-2.rds.amazonaws.com` | Aurora MySQL 클러스터 엔드포인트 |
| `DB_PORT` | `3306` | DB 포트 |
| `DB_USER` | `admin` | DB 사용자명 |
| `DB_NAME` | `<your_database_name>` | 데이터베이스명 |
| `AWS_DB_SECRET_NAME` | `rds!db-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Secrets Manager 시크릿 이름 |
| `JWT_SECRET` | `<256비트 이상 랜덤 문자열>` | JWT 서명 키 |
| `AWS_REGION` | `ap-northeast-2` | AWS 리전 |
| `AWS_S3_BUCKET_NAME` | `<your-s3-bucket-name>` | S3 버킷명 |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>.com` | 앱 공개 URL |

### 선택 환경 변수

| 변수명 | 설명 |
|--------|------|
| `DB_SECRET_ARN` | `AWS_DB_SECRET_NAME` 대신 ARN으로 Secrets Manager 참조 |
| `AWS_ACCESS_KEY_ID` | 로컬 개발용 (프로덕션은 IAM Role 사용, 이 변수 불필요) |
| `AWS_SECRET_ACCESS_KEY` | 로컬 개발용 (프로덕션은 IAM Role 사용, 이 변수 불필요) |
| `HOLIDAY_API_KEY` | 공공데이터포털 공휴일 API 키 |

> ⚠️ `.env` 파일은 절대 git에 커밋하지 마십시오. `.gitignore`에 포함되어 있습니다.

---

## 2. 로컬 개발 환경 설정

### 사전 요구사항

- Node.js 20 LTS 이상
- npm 또는 pnpm
- AWS CLI (로컬에서 Secrets Manager 사용 시)
- MySQL 클라이언트 (스키마 직접 적용 시)

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 개발 서버 시작
npm run dev
```

http://localhost:3000 접속

### 로컬 DB 연결

로컬에서 Aurora MySQL에 직접 연결하려면:

1. EC2 배스천 호스트 또는 SSH 터널 사용
2. 또는 로컬 MySQL 인스턴스 설치 후 `.env`의 `DB_HOST`를 `localhost`로 변경

로컬 환경에서 Secrets Manager를 사용하려면 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 또는 `~/.aws/credentials` 설정이 필요합니다.

---

## 3. 프로덕션 배포 절차

### 초기 서버 설정 (EC2 최초 구성 시)

```bash
# Node.js 20 LTS 설치 (Amazon Linux 2023)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# PM2 전역 설치
sudo npm install -g pm2

# Nginx 설치
sudo yum install -y nginx

# Certbot 설치
sudo yum install -y certbot python3-certbot-nginx
```

### 코드 배포 (업데이트)

```bash
# 1. 최신 코드 pull
cd /path/to/dashboard_v2
git pull origin main

# 2. 의존성 설치 (dev 패키지 제외)
npm ci --omit=dev

# 3. 프로덕션 빌드
npm run build

# 4. PM2 무중단 재시작
pm2 reload ecosystem.config.js

# 5. 서비스 상태 확인
pm2 status
pm2 logs flonics-dashboard --lines 50
```

### 최초 배포 시

```bash
# PM2로 앱 시작
pm2 start ecosystem.config.js

# PM2 자동 시작 설정 (서버 재부팅 후에도 자동 실행)
pm2 startup
pm2 save

# Nginx 시작
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 4. Nginx 설정

설정 파일: `nginx/flonics-dashboard.conf`

```nginx
server {
    listen 80;
    server_name <your-domain>.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name <your-domain>.com;

    ssl_certificate     /etc/letsencrypt/live/<your-domain>.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<your-domain>.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_request_buffering off;
    }
}
```

```bash
# Nginx 설정 적용
sudo cp nginx/flonics-dashboard.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. SSL 인증서 (Let's Encrypt)

### 최초 발급

```bash
sudo certbot --nginx -d <your-domain>.com
```

### 자동 갱신 설정

```bash
# cron 등록 (매일 12시 자동 갱신 시도)
echo "0 12 * * * root certbot renew --quiet && systemctl reload nginx" | sudo tee -a /etc/crontab

# 갱신 테스트
sudo certbot renew --dry-run
```

인증서 유효기간: 90일. Certbot이 만료 30일 전부터 자동 갱신 시도합니다.

---

## 6. 데이터베이스 초기화

### 신규 설치

```bash
mysql -h <your-cluster>.cluster-xxxx.ap-northeast-2.rds.amazonaws.com \
      -u admin -p <your_database_name> < scripts/schema.sql
```

### 점진적 마이그레이션

```bash
# Aurora 스냅샷 생성 후 진행
mysql -h <your-cluster>.cluster-xxxx.ap-northeast-2.rds.amazonaws.com \
      -u admin -p <your_database_name> < scripts/migrations/YYYYMMDD_설명.sql
```

### DB 연결 확인

```bash
mysql -h <your-cluster>.cluster-xxxx.ap-northeast-2.rds.amazonaws.com \
      -u admin -p -e "SHOW TABLES;" <your_database_name>
```

---

## 7. PM2 관리 명령어

| 명령어 | 설명 |
|--------|------|
| `pm2 status` | 앱 상태 확인 |
| `pm2 logs flonics-dashboard` | 실시간 로그 확인 |
| `pm2 logs flonics-dashboard --lines 100` | 최근 100줄 로그 확인 |
| `pm2 reload ecosystem.config.js` | 무중단 재시작 |
| `pm2 restart flonics-dashboard` | 강제 재시작 |
| `pm2 stop flonics-dashboard` | 중지 |
| `pm2 delete flonics-dashboard` | PM2에서 제거 |
| `pm2 monit` | CPU·메모리 모니터링 |

---

## 8. 롤백 절차

### 코드 롤백

```bash
# 이전 커밋으로 이동
git log --oneline -10           # 롤백 대상 커밋 해시 확인
git checkout <commit-hash>

# 빌드 및 재시작
npm ci --omit=dev
npm run build
pm2 reload ecosystem.config.js
```

### DB 롤백

1. Aurora 콘솔에서 배포 직전 스냅샷으로 새 클러스터 복원
2. `.env`의 `DB_HOST`를 새 클러스터 엔드포인트로 변경
3. `pm2 reload ecosystem.config.js`

---

## 9. 트러블슈팅

### 앱이 시작되지 않는 경우

```bash
# PM2 로그 확인
pm2 logs flonics-dashboard --lines 100

# 빌드 오류 확인
npm run build 2>&1 | head -50

# 환경 변수 확인
pm2 env flonics-dashboard
```

### DB 연결 실패

```bash
# Secrets Manager 연결 확인 (EC2에서)
aws secretsmanager get-secret-value \
  --secret-id rds!db-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
  --region ap-northeast-2

# DB 직접 연결 테스트
mysql -h <your-cluster>.cluster-xxxx.ap-northeast-2.rds.amazonaws.com \
      -u admin -p
```

| 오류 | 원인 | 해결 |
|------|------|------|
| `ER_ACCESS_DENIED_ERROR` | 비밀번호 불일치 (로테이션 중) | PM2 재시작으로 Secrets Manager 재조회 |
| `ECONNREFUSED` | RDS 미구동 또는 보안 그룹 차단 | AWS 콘솔에서 RDS 상태 확인, 보안 그룹 인바운드 규칙 확인 |
| `ETIMEDOUT` | 네트워크 연결 불가 | VPC 서브넷 라우팅, 보안 그룹 확인 |

### S3 업로드 실패

```bash
# IAM Role 권한 확인
aws sts get-caller-identity
aws s3 ls s3://<your-s3-bucket-name>/

# 오류 로그
pm2 logs flonics-dashboard | grep "S3\|s3\|upload"
```

### Nginx 502 Bad Gateway

```bash
# Next.js 앱이 실행 중인지 확인
pm2 status
curl http://localhost:3000/api/auth/me

# Nginx 오류 로그
sudo tail -100 /var/log/nginx/error.log
```

### 메모리 초과로 PM2 재시작 반복

```bash
# 현재 메모리 사용량 확인
pm2 monit

# ecosystem.config.js에서 max_memory_restart 상향 조정
# 기본값: 1G → 필요 시 2G로 변경
```
