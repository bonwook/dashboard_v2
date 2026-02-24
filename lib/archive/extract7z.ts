/**
 * 7z 압축 해제 - 7zip-bin 바이너리 + child_process (Windows 경로 이슈 회피)
 */
/// <reference path="./node-7z.d.ts" />
import path from "path"
import fs from "fs/promises"
import { statSync } from "fs"
import os from "os"
import { createRequire } from "module"
import { randomUUID } from "crypto"
import { spawn } from "child_process"
import type { ExtractEntry } from "./types"

const require = createRequire(import.meta.url)

/**
 * Next/번들 환경에서 7za 실행 파일의 실제 디스크 경로를 반환.
 * 7zip-bin의 path7za는 번들 시 __dirname이 잘못되어 ENOENT가 나므로
 * process.cwd() 기준 node_modules 경로를 우선 사용.
 */
function getPath7za(): string {
  if (process.env.USE_SYSTEM_7ZA === "true") {
    return "7za"
  }
  const platform = process.platform
  const arch = process.arch
  const exe = platform === "win32" ? "7za.exe" : "7za"
  const subDir = platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux"

  const cwdBin = path.join(process.cwd(), "node_modules", "7zip-bin", subDir, arch, exe)
  try {
    const stat = statSync(cwdBin, { throwIfNoEntry: false })
    if (stat?.isFile()) return cwdBin
  } catch {
    // ignore
  }
  try {
    const pkgPath = require.resolve("7zip-bin/package.json")
    const binDir = path.dirname(pkgPath)
    return path.join(binDir, subDir, arch, exe)
  } catch {
    return cwdBin
  }
}

function shouldSkip(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/")
  if (normalized.includes("__MACOSX")) return true
  if (normalized.startsWith(".") || normalized.includes("/.")) return true
  return false
}

/**
 * 7za를 cwd + 상대 경로로 실행해 Windows 절대경로 문제 회피
 */
async function extractToTemp(
  cwd: string,
  archiveName: string,
  outDirName: string,
  options: { password?: string; bin: string }
): Promise<void> {
  const args = ["x", archiveName, `-o${outDirName}`, "-y"]
  if (options.password) args.push(`-p${options.password}`)

  return new Promise((resolve, reject) => {
    const proc = spawn(options.bin, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stderr = ""
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString() })
    proc.on("error", (err) => reject(err))
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`7za exited ${code}: ${stderr.slice(0, 500)}`))
    })
  })
}

async function* walkDir(
  dir: string,
  baseDir: string
): AsyncGenerator<{ relativePath: string; fullPath: string }> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const ent of entries) {
    const fullPath = path.join(dir, ent.name)
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/")

    if (ent.isDirectory()) {
      yield* walkDir(fullPath, baseDir)
    } else if (ent.isFile()) {
      if (!shouldSkip(relativePath)) {
        yield { relativePath, fullPath }
      }
    }
  }
}

/**
 * 7z 버퍼에서 항목을 하나씩 yield (임시 파일/폴더 사용 후 삭제)
 */
export async function* extract7zEntries(
  buffer: Buffer,
  password?: string
): AsyncGenerator<ExtractEntry> {
  const id = randomUUID()
  const tempDir = os.tmpdir()
  const archivePath = path.join(tempDir, `extract-${id}.7z`)
  const outDir = path.join(tempDir, `extract-out-${id}`)

  try {
    await fs.writeFile(archivePath, buffer)
    await fs.mkdir(outDir, { recursive: true })

    const pathTo7z = getPath7za()
    const workDir = path.dirname(archivePath)
    const archiveName = path.basename(archivePath)
    const outDirName = path.basename(outDir)
    await extractToTemp(workDir, archiveName, outDirName, { password, bin: pathTo7z })

    let fileCount = 0
    for await (const { relativePath, fullPath } of walkDir(outDir, outDir)) {
      fileCount++
      const fileBuffer = await fs.readFile(fullPath)
      yield { path: relativePath, buffer: fileBuffer }
    }
    if (fileCount === 0) {
      console.warn("[extract7z] extractToTemp completed but no files in output dir:", outDir)
    }
  } finally {
    await fs.rm(outDir, { recursive: true, force: true }).catch(() => {})
    await fs.unlink(archivePath).catch(() => {})
  }
}

/**
 * 7z 항목 수만 list 명령으로 조회 (용량은 0, 진행률은 개수 기준)
 */
export async function get7zEntryStats(buffer: Buffer): Promise<{
  count: number
  totalUncompressedSize: number
}> {
  const { list } = await import("node-7z")
  const id = randomUUID()
  const archivePath = path.join(os.tmpdir(), `list-${id}.7z`)
  try {
    await fs.writeFile(archivePath, buffer)
    const pathTo7z = getPath7za()
    let count = 0
    await new Promise<void>((resolve, reject) => {
      const stream = list(archivePath, { $bin: pathTo7z })
      stream.on("data", () => {
        count += 1
      })
      stream.on("end", () => resolve())
      stream.on("error", reject)
    })
    return { count, totalUncompressedSize: 0 }
  } finally {
    await fs.unlink(archivePath).catch(() => {})
  }
}
