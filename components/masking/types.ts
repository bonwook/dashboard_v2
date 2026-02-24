/** NIfTI 헤더 공통 타입 (nifti-reader-js 호환) */
export interface NiftiHeaderLike {
  dims: number[]
  datatypeCode: number
  numBitsPerVoxel: number
  vox_offset: number
  littleEndian?: boolean
  scl_slope?: number
  scl_inter?: number
  cal_min?: number
  cal_max?: number
}

/** 파일 리스트 항목 (로컬 또는 서버) */
export interface NiiFileItem {
  id: string
  name: string
  /** 로컬 File 또는 서버 path */
  source: File | string
  /** 작업 완료(저장) 여부 – 리스트 색상 표시용 */
  completed: boolean
  /** 로드된 NIfTI 메타 (선택) */
  header?: NiftiHeaderLike
}

/** 슬라이스 방향 */
export type SliceAxis = "axial" | "coronal" | "sagittal"

/** 2D 슬라이스 + 메타 */
export interface Slice2D {
  width: number
  height: number
  /** RGBA 픽셀 (canvas용) */
  data: Uint8ClampedArray
  /** 현재 슬라이스 인덱스 */
  sliceIndex: number
  axis: SliceAxis
}

/** 마스크 레이어 (슬라이스와 동일 크기, 0/255) */
export type MaskLayer = Uint8Array
