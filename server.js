// server.js
const path = require("path")
const fs = require("fs")

// 명시적으로 작업 디렉토리 설정 (PM2 실행 시 안정성을 위해)
const rootDir = path.resolve(__dirname)
process.chdir(rootDir)

const envPath = path.join(rootDir, ".env")

if (fs.existsSync(envPath)) {
  require("dotenv").config({
    path: envPath,
    override: false,
  })
} else {
  console.warn("[Server] .env not found")
}

// 필수 환경변수 체크 (Secrets Manager 사용 시 DB_PASSWORD 생략 가능)
const useDbSecret = !!(process.env.AWS_DB_SECRET_NAME || process.env.DB_SECRET_ARN)
const requiredVars = [
  'DB_HOST',
  'DB_USER',
  ...(useDbSecret ? [] : ['DB_PASSWORD']),
  'DB_NAME',
  'JWT_SECRET',
]

const missingVars = requiredVars.filter(
  (key) => !process.env[key] || process.env[key].trim() === ""
)

if (missingVars.length > 0) {
  console.error("[Server] Missing env vars:", missingVars)
  process.exit(1)
}

// Next.js가 올바른 디렉토리에서 실행되도록 확인
if (process.cwd() !== rootDir) {
  console.warn("[Server] Warning: Working directory mismatch, changing to:", rootDir)
  process.chdir(rootDir)
}

// Next.js 실행
const nextArgs = process.argv.slice(2)
process.argv = ["node", "next", ...nextArgs]
require("next/dist/bin/next")