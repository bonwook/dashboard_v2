export interface Task {
  id: string
  assigned_to: string
  assigned_by: string
  assigned_by_name: string
  assigned_by_email: string
  assigned_to_name?: string
  assigned_to_email?: string
  title: string
  subtitle?: string
  content: string | null
  description: string | null
  comment?: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'on_hold' | 'awaiting_completion' | 'completed'
  file_keys: string[]
  comment_file_keys?: string[]
  shared_with?: string[]
  created_at: string
  updated_at: string
  completed_at: string | null
  due_date?: string | null
  is_multi_assign?: boolean
  is_subtask?: boolean
  task_id?: string
  /** progress 탭에서 구분: 내가 요청한 업무 vs 요청받은 업무 */
  taskType?: 'requested' | 'received'
  /** 공동업무 병합 시 해당 메인에 속한 서브태스크 id 목록 (상태 변경 시 전체 PATCH용) */
  _subtaskIds?: string[]
}

export interface Profile {
  id: string
  email: string
  full_name: string
  organization: string
  role: string
}

export type TaskStatus = 'pending' | 'in_progress' | 'on_hold' | 'awaiting_completion' | 'completed'

export interface ResolvedFileKey {
  originalKey: string
  s3Key: string
  fileName: string
  uploadedAt?: string | null
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
