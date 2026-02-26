# Scripts

데이터베이스 스키마 정의 파일입니다.

## 📁 파일

- **`schema.sql`** - 전체 데이터베이스 스키마 정의

## 🗄️ 데이터베이스 구조

`schema.sql` 파일에 정의된 테이블:

- **profiles** - 사용자 프로필 (client/staff 역할)
- **task_assignments** - 업무 할당
- **task_subtasks** - 하위 업무 (공동 업무용)
- **task_file_attachments** - 업무 파일 첨부
- **task_status_history** - 업무 상태 변경 이력
- **s3_updates** - S3 업로드 파일 추적
- **user_files** - 사용자 업로드 파일
- **report_metadata** - 리포트 메타데이터
- **report_info** - 리포트 상세 정보
- **audit_log** - 시스템 감사 로그
- **migration_history** - 데이터베이스 마이그레이션 이력
