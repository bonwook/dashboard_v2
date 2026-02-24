/**
 * ZIP 압축 해제 - unzipper 기반
 */
import unzipper from "unzipper"
import type { ExtractEntry } from "./types"

function shouldSkip(path: string, isDirectory: boolean): boolean {
  if (isDirectory) return true
  if (path.includes("__MACOSX")) return true
  if (path.startsWith(".") || path.includes("/.")) return true
  return false
}

/**
 * ZIP 버퍼에서 항목을 하나씩 yield (비밀번호 지원)
 */
export async function* extractZipEntries(
  buffer: Buffer,
  password?: string
): AsyncGenerator<ExtractEntry> {
  const directory = await unzipper.Open.buffer(buffer)

  for (const file of directory.files) {
    if (shouldSkip(file.path, file.type === "Directory")) continue

    let fileBuffer: Buffer
    try {
      fileBuffer = password ? await file.buffer(password) : await file.buffer()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === "MISSING_PASSWORD" || msg.includes("password")) {
        throw new Error("ZIP_MISSING_PASSWORD")
      }
      throw err
    }

    yield { path: file.path.replace(/\\/g, "/"), buffer: fileBuffer }
  }
}

/**
 * ZIP 항목 수와 예상 압축 해제 크기 (진행률용)
 */
export async function getZipEntryStats(buffer: Buffer): Promise<{
  count: number
  totalUncompressedSize: number
}> {
  const directory = await unzipper.Open.buffer(buffer)
  const valid = directory.files.filter(
    (f) => !shouldSkip(f.path, f.type === "Directory")
  )
  const totalSize = valid.reduce((sum, f) => sum + (f.uncompressedSize ?? 0), 0)
  return { count: valid.length, totalUncompressedSize: totalSize }
}
