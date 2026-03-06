# 기여 가이드

## 브랜치 전략

```
main        ← 프로덕션 브랜치 (직접 push 금지)
develop     ← 통합 개발 브랜치
feature/*   ← 기능 개발 브랜치 (예: feature/task-calendar)
fix/*       ← 버그 수정 브랜치 (예: fix/auth-cookie-expire)
hotfix/*    ← 긴급 수정 (main에서 분기)
```

## 개발 플로우

```bash
# 1. develop에서 feature 브랜치 생성
git switch develop
git pull origin develop
git switch -c feature/기능명

# 2. 개발 및 커밋
git add .
git commit -m "feat: 기능 설명"

# 3. develop으로 PR 생성
# PR 병합 후 브랜치 삭제
```

## 커밋 메시지 규칙

[Conventional Commits](https://www.conventionalcommits.org/) 형식을 사용합니다.

| 타입 | 사용 시 |
|------|---------|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 수정 |
| `style` | 코드 포맷 변경 (기능 변경 없음) |
| `refactor` | 코드 리팩토링 |
| `test` | 테스트 추가·수정 |
| `chore` | 빌드·CI 설정 변경 |

```bash
# 예시
git commit -m "feat: 업무 첨부파일 7일 만료 기능 추가"
git commit -m "fix: Client가 타인 업무에 접근 가능한 버그 수정"
git commit -m "docs: API 레퍼런스 업데이트"
```

## 코드 규칙

### TypeScript

- `any` 타입 사용 금지 (`lib/types/` 에 타입 정의)
- 모든 API Route는 반환 타입 명시
- `eslint-disable` 사용 시 이유 주석 필수

### API 보안 필수사항

모든 API Route에 아래 사항을 반드시 적용합니다.

```typescript
// 1. 인증 검증 (필수)
const user = await requireAuth()  // 또는 requireRole('staff')

// 2. DB 쿼리 — Prepared Statement 전용
await query('SELECT * FROM table WHERE id = ?', [id])  // ✅
await query(`SELECT * FROM table WHERE id = '${id}'`) // ❌ 절대 금지

// 3. Client 데이터 격리
if (user.role === 'client') {
  sql += ' AND user_id = ?'  // 반드시 필터 강제
  params.push(user.id)
}
```

### 환경 변수

- 민감 정보는 `.env`에만 저장, 코드에 직접 작성 금지
- 새로운 환경 변수 추가 시 `.env.example`에도 반드시 추가

## 배포 전 체크리스트

```bash
# TypeScript 오류 확인
npm run tsc

# ESLint 오류 확인
npm run lint

# 단위 테스트 통과 확인
npm test

# 보안 취약점 확인
npm audit --audit-level=high
```

## PR 리뷰 기준

- [ ] TypeScript 오류 없음 (`npm run tsc` 통과)
- [ ] ESLint 오류 없음 (`npm run lint` 통과)
- [ ] 새로운 API에 인증·RBAC 적용 확인
- [ ] DB 쿼리에 Prepared Statement 사용 확인
- [ ] Client 데이터 격리 로직 확인
- [ ] 환경 변수 `.env.example` 업데이트 확인
