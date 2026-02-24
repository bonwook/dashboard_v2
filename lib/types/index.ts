export type UserRole = "admin" | "client" | "staff"

export type CaseStatus = "registered" | "processing" | "completed" | "failed"

export type BillingStatus = "pending" | "paid" | "cancelled"

export interface Profile {
  id: string
  email: string
  full_name: string | null
  organization: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Case {
  id: string
  case_number: string
  patient_name: string
  study_date: string
  data_type: string
  client_id: string
  client_organization: string | null
  dicom_source: string | null
  s3_path: string | null
  status: CaseStatus
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Report {
  id: string
  case_id: string
  report_html: string
  uploaded_by: string
  created_at: string
}

export interface Billing {
  id: string
  case_id: string
  amount: number | null
  currency: string
  status: BillingStatus
  invoice_date: string | null
  paid_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  case_id: string | null
  user_id: string | null
  action: string
  details: Record<string, any> | null
  created_at: string
}

// Excel 관련 타입
export interface ExcelData {
  [key: string]: any
}

export interface ExcelDataWithIndex extends ExcelData {
  __originalIndex: number
}

export interface ParseResponse {
  headers: string[]
  data: ExcelData[]
  error?: string
}

// 태스크/서브태스크 도메인 (API·케이스 상세·워크리스트 공용)
export type TaskPriority = "low" | "medium" | "high" | "urgent"
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "on_hold"
  | "awaiting_completion"
  | "completed"

export interface Task {
  id: string
  assigned_to: string
  assigned_by: string
  assigned_by_name?: string
  assigned_by_email?: string
  assigned_to_name?: string
  assigned_to_email?: string
  title: string
  content: string | null
  description: string | null
  comment?: string | null
  priority: TaskPriority
  status: TaskStatus
  file_keys: string[]
  comment_file_keys?: string[]
  due_date?: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  is_multi_assign?: boolean
  has_any_attachment?: boolean
}

export interface Subtask {
  id: string
  task_id: string
  subtitle: string
  assigned_to: string
  assigned_to_name?: string
  assigned_to_email?: string
  content: string | null
  comment?: string | null
  status: TaskStatus
  file_keys: string[]
  comment_file_keys?: string[]
  created_at: string
  updated_at: string
  completed_at: string | null
}

/** S3 건 연결 시 표시용 (케이스 상세 등) */
export interface S3UpdateForTask {
  id: number
  file_name: string
  bucket_name?: string | null
  file_size?: number | null
  upload_time?: string | null
  created_at: string
  s3_key: string
}

/** S3 건 목록용 (워크리스트 등, task_id 포함) */
export interface S3UpdateRow {
  id: number
  file_name: string
  bucket_name?: string | null
  file_size?: number | null
  upload_time?: string | null
  created_at: string
  task_id: string | null
  s3_key: string
}
