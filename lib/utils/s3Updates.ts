/**
 * s3_updates 행에서 S3 객체 키 생성 (bucket_name + file_name 또는 file_name만)
 */
export function toS3Key(row: {
  file_name: string
  bucket_name?: string | null
}): string {
  const name = row.file_name ?? ""
  const prefix = (row.bucket_name ?? "").trim()
  return prefix ? `${prefix}/${name}` : name
}
