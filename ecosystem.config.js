// Load .env file and prepare environment variables
const fs = require("fs")
const path = require("path")

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env")
  const envVars = {}

  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf8")
    envFile.split("\n").forEach((line) => {
      line = line.trim()
      if (!line || line.startsWith("#")) {
        return
      }

      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }

        envVars[key] = value
      }
    })
  }

  return envVars
}

let envVars = {}
try {
  require("dotenv").config()
  envVars = loadEnvFile()
} catch (e) {
  envVars = loadEnvFile()
}

// Remove NODE_ENV from env vars to let Next.js handle it automatically
// Next.js will set NODE_ENV automatically:
// - "development" for "next dev"
// - "production" for "next build" and "next start"
const { NODE_ENV, ...envVarsWithoutNodeEnv } = envVars
const { NODE_ENV: processNodeEnv, ...processEnvWithoutNodeEnv } = process.env

const finalEnv = {
  PORT: 3000,
  ...envVarsWithoutNodeEnv,
  ...processEnvWithoutNodeEnv,
  // NODE_ENV is intentionally omitted - Next.js will set it automatically
}

const useDbSecret = !!(finalEnv.AWS_DB_SECRET_NAME || finalEnv.DB_SECRET_ARN)
const requiredVars = ["DB_HOST", "DB_USER", ...(useDbSecret ? [] : ["DB_PASSWORD"]), "DB_NAME", "JWT_SECRET"]
const loadedVars = requiredVars.map((key) => ({
  key,
  loaded: !!finalEnv[key],
  hasValue: !!finalEnv[key] && finalEnv[key].length > 0,
}))

console.log("[PM2] Environment variables status:")
loadedVars.forEach(({ key, loaded, hasValue }) => {
  console.log(`  ${key}: ${loaded && hasValue ? "✓ Loaded" : "✗ Missing"}`)
})

if (loadedVars.some((v) => !v.loaded || !v.hasValue)) {
  console.warn("[PM2] Warning: Some required environment variables are missing!")
  console.warn("[PM2] Make sure .env file exists in the project root directory.")
}

module.exports = {
  apps: [
    {
      name: "flonics-dashboard",
      script: path.join(__dirname, "server.js"),
      args: "start -p 3000",
      cwd: path.resolve(__dirname), // 절대 경로로 명시
      instances: 1,
      exec_mode: "fork",
      env: finalEnv,
      error_file: path.join(__dirname, "logs", "pm2-error.log"),
      out_file: path.join(__dirname, "logs", "pm2-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
}

