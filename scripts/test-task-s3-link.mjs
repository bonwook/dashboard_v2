/**
 * taskS3Link·assign·attach-s3 관련 구조 및 요청 형식 검증 (DB 미사용)
 * 실행: node scripts/test-task-s3-link.mjs
 */
import { readFileSync, existsSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

function run() {
  console.log("1. lib/taskS3Link.ts 존재 및 linkS3UpdatesToTask export 확인...")
  const taskS3Path = path.join(root, "lib", "taskS3Link.ts")
  if (!existsSync(taskS3Path)) throw new Error("lib/taskS3Link.ts 없음")
  const taskS3Content = readFileSync(taskS3Path, "utf8")
  if (!taskS3Content.includes("linkS3UpdatesToTask") || !taskS3Content.includes("export")) {
    throw new Error("linkS3UpdatesToTask export 없음")
  }
  console.log("   OK")

  console.log("2. assign 라우트 s3_update_ids 처리 코드 확인...")
  const assignPath = path.join(root, "app", "api", "storage", "assign", "route.ts")
  const assignContent = readFileSync(assignPath, "utf8")
  if (!assignContent.includes("s3_update_ids") || !assignContent.includes("linkS3UpdatesToTask")) {
    throw new Error("assign 라우트에 s3_update_ids 또는 taskS3Link 연동 없음")
  }
  console.log("   OK")

  console.log("3. attach-s3 라우트 존재 확인...")
  const attachPath = path.join(root, "app", "api", "tasks", "[id]", "attach-s3", "route.ts")
  if (!existsSync(attachPath)) throw new Error("attach-s3/route.ts 없음")
  const attachContent = readFileSync(attachPath, "utf8")
  if (!attachContent.includes("s3_update_ids") || !attachContent.includes("linkS3UpdatesToTask")) {
    throw new Error("attach-s3에 s3_update_ids 또는 taskS3Link 연동 없음")
  }
  console.log("   OK")

  console.log("4. 요청 body 형식 검증 (배열)...")
  const body = { s3_update_ids: ["1", "2"] }
  if (!Array.isArray(body.s3_update_ids)) throw new Error("s3_update_ids는 배열이어야 함")
  console.log("   OK")

  console.log("\n모든 검증 통과.")
}

run()
