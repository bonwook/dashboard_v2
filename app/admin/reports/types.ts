/** 의료 리포트 폼 필드 단일 항목 */
export type ReportFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "textarea"
  | "phone"
  | "email"
  | "yesno"

export interface ReportFieldOption {
  value: string
  label: string
}

export interface ReportField {
  id: string
  label: string
  type: ReportFieldType
  placeholder?: string
  options?: ReportFieldOption[]
  min?: number
  max?: number
  unit?: string
  /** HIPAA 등 식별자 표시용 */
  identifier?: boolean
}

export interface ReportSection {
  id: string
  title: string
  description?: string
  fields: ReportField[]
}

/** 폼 값: 필드 id -> 값 */
export type FormValues = Record<string, string | number | undefined>

/** 가져오기된 파일 데이터 */
export interface ImportedData {
  fileName: string
  headers: string[]
  rows: string[][]
}

/** 병합된 미리보기: 선택 필드 헤더 + 기존 파일 헤더/행 */
export interface MergedPreview {
  headers: string[]
  rows: string[][]
}
