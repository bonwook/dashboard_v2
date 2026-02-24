/**
 * MIME 타입 검증 유틸리티
 * 파일 확장자 조작 공격 방어
 */

// 파일 확장자별 허용된 MIME 타입 매핑
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  // Excel
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  xls: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  csv: [
    "text/csv",
    "application/vnd.ms-excel",
    "text/plain",
  ],
  // PDF
  pdf: [
    "application/pdf",
  ],
  // DICOM
  dcm: [
    "application/dicom",
    "application/octet-stream", // 일부 시스템에서 DICOM이 octet-stream으로 인식됨
  ],
  dicom: [
    "application/dicom",
    "application/octet-stream",
  ],
  // NIfTI
  nii: [
    "application/octet-stream",
    "application/x-nifti",
  ],
  "nii.gz": [
    "application/gzip",
    "application/x-gzip",
    "application/octet-stream",
  ],
  nifti: [
    "application/octet-stream",
    "application/x-nifti",
  ],
  // ZIP
  zip: [
    "application/zip",
    "application/x-zip-compressed",
  ],
  "7z": [
    "application/x-7z-compressed",
  ],
}

/**
 * 파일 확장자로부터 예상되는 MIME 타입 목록을 반환합니다.
 * @param extension 파일 확장자 (소문자)
 * @returns 허용된 MIME 타입 배열
 */
export function getAllowedMimeTypes(extension: string): string[] {
  return ALLOWED_MIME_TYPES[extension.toLowerCase()] || []
}

/**
 * 파일의 실제 MIME 타입이 확장자와 일치하는지 검증합니다.
 * @param file 파일 객체
 * @param extension 파일 확장자
 * @returns 검증 통과 시 true
 */
export function validateMimeType(file: File, extension: string): boolean {
  const allowedTypes = getAllowedMimeTypes(extension)
  
  // 허용된 타입이 없으면 검증 스킵 (기본적으로 허용)
  if (allowedTypes.length === 0) {
    return true
  }

  const fileMimeType = file.type || "application/octet-stream"
  
  // 정확한 매칭 또는 와일드카드 매칭
  return allowedTypes.some(allowedType => {
    // 정확한 매칭
    if (fileMimeType === allowedType) {
      return true
    }
    
    // 와일드카드 매칭 (예: "application/*")
    if (allowedType.endsWith("/*")) {
      const baseType = allowedType.split("/")[0]
      return fileMimeType.startsWith(`${baseType}/`)
    }
    
    return false
  })
}

/**
 * 파일의 Magic Bytes를 확인하여 실제 파일 타입을 검증합니다.
 * 주의: 이 함수는 클라이언트 사이드에서만 작동합니다.
 * @param file 파일 객체
 * @param expectedExtension 예상되는 확장자
 * @returns 검증 통과 시 true
 */
export async function validateFileByMagicBytes(
  file: File,
  expectedExtension: string
): Promise<boolean> {
  // 서버 사이드에서는 검증 스킵 (Magic Bytes 검증은 클라이언트에서만 가능)
  if (typeof window === "undefined") {
    return true
  }

  // 파일의 첫 몇 바이트를 읽어서 Magic Bytes 확인
  const buffer = await file.slice(0, 8).arrayBuffer()
  const bytes = new Uint8Array(buffer)
  
  // Magic Bytes 매핑
  const magicBytes: Record<string, number[][]> = {
    // PDF: %PDF-
    pdf: [[0x25, 0x50, 0x44, 0x46]],
    // ZIP: PK (ZIP 파일의 시작)
    zip: [[0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06], [0x50, 0x4B, 0x07, 0x08]],
    // Excel (Office Open XML): PK (ZIP 기반)
    xlsx: [[0x50, 0x4B, 0x03, 0x04]],
    // Excel (Binary): D0 CF 11 E0 A1 B1 1A E1
    xls: [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]],
  }

  const expectedMagicBytes = magicBytes[expectedExtension.toLowerCase()]
  if (!expectedMagicBytes) {
    // Magic Bytes 검증이 없는 확장자는 통과
    return true
  }

  // Magic Bytes 매칭 확인
  return expectedMagicBytes.some(magic => {
    return magic.every((byte, index) => bytes[index] === byte)
  })
}
