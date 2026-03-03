/**
 * s3_updates 행에서 S3 객체 키 생성 (bucket_name + file_name 또는 file_name만)
 * file_name이 이미 bucket_name/으로 시작하면 중복 접두사를 붙이지 않음
 */
export function toS3Key(row: {
  file_name: string
  bucket_name?: string | null
}): string {
  const name = row.file_name ?? ""
  const prefix = (row.bucket_name ?? "").trim()
  if (!prefix) return name
  if (name.startsWith(prefix + "/")) return name
  return `${prefix}/${name}`
}
