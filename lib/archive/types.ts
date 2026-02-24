/**
 * 압축 해제 공통 타입 및 상수
 */

export interface ExtractEntry {
  path: string
  buffer: Buffer
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

export const MIME_TYPES: Record<string, string> = {
  txt: "text/plain",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  dcm: "application/dicom",
  dicom: "application/dicom",
  nii: "application/octet-stream",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
}

export type ArchiveFileType = "excel" | "pdf" | "dicom" | "nifti" | "zip" | "other"

export function getContentType(extension: string): string {
  return MIME_TYPES[extension] ?? "application/octet-stream"
}

export function getFileTypeFromExtension(extension: string): ArchiveFileType {
  if (["xlsx", "xls", "csv"].includes(extension)) return "excel"
  if (extension === "pdf") return "pdf"
  if (["dcm", "dicom"].includes(extension)) return "dicom"
  if (extension === "nii") return "nifti"
  if (extension === "zip" || extension === "7z") return "zip"
  return "other"
}

/** 압축 파일 확장자로 지원 포맷 여부 */
export function isSupportedArchiveExt(keyOrFileName: string): boolean {
  const lower = keyOrFileName.toLowerCase()
  return lower.endsWith(".zip") || lower.endsWith(".7z")
}

/** 키에서 압축 해제 대상 폴더 경로 생성 (확장자 제거) */
export function getTargetFolderPath(key: string): string {
  const parts = key.split("/")
  const fileName = parts[parts.length - 1]
  const withoutExt = fileName.replace(/\.(zip|7z)$/i, "")
  return parts.slice(0, -1).join("/") + "/" + withoutExt
}
