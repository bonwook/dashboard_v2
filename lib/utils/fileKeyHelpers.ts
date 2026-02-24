/**
 * 파일 키 처리 관련 유틸리티 함수들
 */

/**
 * 파일 키가 유효한 문자열인지 확인
 */
export function isValidFileKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0
}

/**
 * API 응답의 file_keys/comment_file_keys를 string[]로 통일
 * - string[] 그대로 사용, { key: string; uploaded_at?: unknown }[] 인 경우 key만 추출
 * - s3_key, s3Key, path 등 다른 필드도 추출 시도
 */
export function normalizeFileKeyArray(keys: unknown): string[] {
  if (!Array.isArray(keys)) return []
  return keys
    .map((item) => {
      if (typeof item === "string" && item.length > 0) return item
      if (typeof item !== "object" || item === null) return null
      const o = item as Record<string, unknown>
      if (typeof o.key === "string" && o.key.length > 0) return o.key
      if (typeof o.s3_key === "string" && o.s3_key.length > 0) return o.s3_key
      if (typeof o.s3Key === "string" && o.s3Key.length > 0) return o.s3Key
      if (typeof o.path === "string" && o.path.length > 0) return o.path
      return null
    })
    .filter((k): k is string => k !== null && k.length > 0)
}

/**
 * 파일 키 배열에서 유효한 키만 필터링
 */
export function filterValidFileKeys(keys: unknown[]): string[] {
  return keys.filter(isValidFileKey)
}

/**
 * S3 키에서 파일명 추출
 */
export function extractFileName(s3Key: string, fallback: string = "파일"): string {
  if (!isValidFileKey(s3Key)) {
    return fallback
  }
  
  const parts = s3Key.split("/")
  const fileName = parts[parts.length - 1]
  
  return fileName || fallback
}

/**
 * 파일 키를 S3 키와 파일명으로 변환
 */
export interface ResolvedFileKey {
  s3Key: string
  fileName: string
  uploadedAt?: string | null
}

export function resolveFileKey(
  key: unknown,
  fallbackFileName: string = "파일"
): ResolvedFileKey {
  if (!isValidFileKey(key)) {
    return {
      s3Key: "",
      fileName: fallbackFileName,
    }
  }

  return {
    s3Key: key,
    fileName: extractFileName(key, fallbackFileName),
  }
}

/**
 * 파일 키 배열을 resolve
 */
export function resolveFileKeys(
  keys: unknown[],
  fallbackFileName: string = "파일"
): ResolvedFileKey[] {
  return filterValidFileKeys(keys).map((key) =>
    resolveFileKey(key, fallbackFileName)
  )
}

/**
 * API 응답에서 resolve된 파일 키 추출
 */
export interface ApiResolvedKey {
  originalKey: string
  s3Key: string
  fileName: string
  userId?: string | null
  uploadedAt?: string | null
}

export function mapResolvedKeys(
  resolvedKeys: unknown[]
): Map<string, { s3Key: string; fileName: string; userId: string | null; uploadedAt: string | null }> {
  const keyMap = new Map<
    string,
    { s3Key: string; fileName: string; userId: string | null; uploadedAt: string | null }
  >()

  if (!Array.isArray(resolvedKeys)) {
    return keyMap
  }

  resolvedKeys.forEach((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      "originalKey" in item &&
      "s3Key" in item &&
      "fileName" in item
    ) {
      const key = item as ApiResolvedKey
      keyMap.set(String(key.originalKey), {
        s3Key: key.s3Key,
        fileName: key.fileName,
        userId: key.userId ?? null,
        uploadedAt: key.uploadedAt ?? null,
      })
    }
  })

  return keyMap
}

/**
 * 파일 분류 - 업로더 기준으로 파일 분리
 */
export interface FileClassificationOptions {
  allKeys: string[]
  resolvedKeyMap: Map<
    string,
    { s3Key: string; fileName: string; userId: string | null; uploadedAt: string | null }
  >
  clientId: string | null
  preferUserKeys: string[]
}

export interface ClassifiedFiles {
  adminFiles: ResolvedFileKey[]
  userFiles: ResolvedFileKey[]
}

export function classifyFilesByUploader(
  options: FileClassificationOptions
): ClassifiedFiles {
  const { allKeys, resolvedKeyMap, clientId, preferUserKeys } = options

  const userFiles: ResolvedFileKey[] = []
  const adminFiles: ResolvedFileKey[] = []

  allKeys.forEach((key) => {
    if (!isValidFileKey(key)) {
      return
    }

    const mapValue = resolvedKeyMap.get(key)
    const resolved: ResolvedFileKey = mapValue
      ? { s3Key: mapValue.s3Key, fileName: mapValue.fileName, uploadedAt: mapValue.uploadedAt }
      : resolveFileKey(key)
    
    const isUserOwned =
      clientId && mapValue?.userId && mapValue.userId === clientId
    const preferUser = preferUserKeys.includes(key)

    if (isUserOwned || preferUser) {
      userFiles.push(resolved)
    } else {
      adminFiles.push(resolved)
    }
  })

  return { adminFiles, userFiles }
}

/**
 * 서브태스크 파일 키 처리
 */
export interface SubtaskFileKeyItem {
  key: string
  subtaskId: string
  assignedToName: string
}

export interface ResolvedSubtaskFile {
  s3Key: string
  fileName: string
  subtaskId: string
  assignedToName: string
  uploadedAt?: string | null
}

export function resolveSubtaskFileKeys(
  items: SubtaskFileKeyItem[],
  resolvedKeyMap: Map<string, { s3Key: string; fileName: string; uploadedAt?: string | null }>
): ResolvedSubtaskFile[] {
  return items
    .filter((item) => isValidFileKey(item.key))
    .map((item) => {
      const resolved = resolvedKeyMap.get(item.key) || resolveFileKey(item.key)
      return {
        s3Key: resolved.s3Key,
        fileName: resolved.fileName,
        subtaskId: item.subtaskId,
        assignedToName: item.assignedToName,
        uploadedAt: 'uploadedAt' in resolved ? resolved.uploadedAt : null,
      }
    })
}
