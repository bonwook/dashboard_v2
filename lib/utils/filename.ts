/**
 * 파일명 검증 및 Sanitization 유틸리티
 * 경로 탐색 공격 방어
 */

/**
 * 파일명에서 경로 탐색 공격을 방어하기 위해 특수 문자를 제거합니다.
 * @param filename 원본 파일명
 * @returns sanitized 파일명
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return "file"

  // 경로 탐색 공격 방어: ../, ..\\, /, \ 제거
  let sanitized = filename
    .replace(/\.\./g, "") // .. 제거
    .replace(/[\/\\]/g, "_") // /, \ 를 _ 로 변경
    .replace(/^\.+/, "") // 선행 . 제거
    .trim()

  // 빈 문자열이면 기본값 반환
  if (!sanitized) {
    sanitized = "file"
  }

  // 파일명 길이 제한 (255자)
  if (sanitized.length > 255) {
    const ext = sanitized.split(".").pop()
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf("."))
    sanitized = nameWithoutExt.substring(0, 255 - (ext ? ext.length + 1 : 0)) + (ext ? `.${ext}` : "")
  }

  // 위험한 문자 제거
  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, "")

  return sanitized
}

/**
 * 파일명이 안전한지 검증합니다.
 * @param filename 검증할 파일명
 * @returns 안전하면 true, 위험하면 false
 */
export function isValidFilename(filename: string): boolean {
  if (!filename || filename.trim().length === 0) {
    return false
  }

  // 경로 탐색 공격 패턴 검사
  if (
    filename.includes("..") ||
    filename.includes("../") ||
    filename.includes("..\\") ||
    filename.startsWith("/") ||
    filename.startsWith("\\") ||
    filename.includes("\0") // null byte
  ) {
    return false
  }

  // 위험한 문자 검사
  const dangerousChars = /[<>:"|?*\x00-\x1f]/
  if (dangerousChars.test(filename)) {
    return false
  }

  // 파일명 길이 검사
  if (filename.length > 255) {
    return false
  }

  return true
}

/**
 * S3 키 경로가 사용자 디렉토리 내에 있는지 검증합니다.
 * @param s3Key S3 키 경로
 * @param userId 사용자 ID
 * @returns 안전하면 true, 위험하면 false
 */
export function isValidS3Key(s3Key: string, userId: string): boolean {
  if (!s3Key || !userId) {
    return false
  }

  // 사용자 디렉토리로 시작해야 함
  if (!s3Key.startsWith(`${userId}/`)) {
    return false
  }

  // 경로 탐색 공격 방어
  if (s3Key.includes("..") || s3Key.includes("../") || s3Key.includes("..\\")) {
    return false
  }

  return true
}
