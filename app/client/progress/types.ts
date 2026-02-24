export interface Task {
  id: string
  assigned_to: string
  assigned_by: string
  assigned_by_name: string
  assigned_by_email: string
  assigned_to_name?: string
  assigned_to_email?: string
  title: string
  subtitle?: string  // subtask의 부제목
  content: string | null
  description: string | null
  comment?: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'on_hold' | 'awaiting_completion' | 'completed'
  file_keys: string[]
  comment_file_keys?: string[]
  due_date?: string | null
  is_multi_assign?: boolean
  is_subtask?: boolean
  task_id?: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

/** S3 출처 업무일 때 API에서 함께 오는 버킷 정보 */
export interface S3UpdateInfo {
  id?: string | number
  file_name: string
  bucket_name?: string | null
  s3_key: string
  file_size?: number | null
  upload_time?: string | null
  created_at?: string
}

export type TaskStatus = 'pending' | 'in_progress' | 'on_hold' | 'awaiting_completion' | 'completed'

export interface ResolvedFileKey {
  originalKey: string
  s3Key: string
  fileName: string
  uploadedAt?: string | null
  userId?: string | null
}

export interface EditorState {
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface WorkForm {
  title: string
  content: string
  priority: string
}

export interface TableGridHover {
  row: number
  col: number
  show: boolean
}
