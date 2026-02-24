export interface S3File {
  key: string
  size: number
  lastModified: Date
  contentType?: string
  description?: string
  fileName?: string
  fileType?: string
  folderPath?: string
}

export interface ExcelSheet {
  name: string
  headers: string[]
  rows: any[][]
}

export interface ExcelPreview {
  type: "excel" | "csv"
  headers: string[]
  data: any[]
  totalRows: number
  sheets?: ExcelSheet[]
}

export interface DicomPreview {
  type: "dicom"
  metadata: Record<string, any>
  hasImage: boolean
  imageDataUrl: string | null
}

export interface TextPreview {
  type: "text"
  content: string
  totalLines: number
}

export interface NiftiPreview {
  type: "nifti"
  metadata: Record<string, any>
}

export interface OtherFile {
  name: string
  size: number
  type: string
  lastModified: Date
}

export type FilePreview = ExcelPreview | DicomPreview | TextPreview | NiftiPreview | null

export interface Profile {
  id: string
  email: string
  full_name: string
  organization: string
  role: string
}

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
}

export interface EditorState {
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface TableGridHover {
  row: number
  col: number
  show: boolean
}
