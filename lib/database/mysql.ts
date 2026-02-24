import mysql from "mysql2/promise"
import { getDbPassword } from "@/lib/aws/secrets"

const globalForPool = globalThis as unknown as {
  __flonicsMysqlPool: mysql.Pool | undefined
}

function checkRequiredEnvVars(): void {
  const required = ["DB_HOST", "DB_USER", "DB_NAME"] as const
  const missingVars = required.filter((varName) => !process.env[varName]?.trim())
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`)
  }
  if (!process.env.AWS_DB_SECRET_NAME?.trim() && !process.env.DB_SECRET_ARN?.trim()) {
    throw new Error("DB password is managed by AWS Secrets Manager. Set AWS_DB_SECRET_NAME or DB_SECRET_ARN.")
  }
}

/**
 * MySQL 연결 풀 반환. 비밀번호는 AWS Secrets Manager에서 로드합니다.
 */
export async function getPool(): Promise<mysql.Pool> {
  if (!globalForPool.__flonicsMysqlPool) {
    checkRequiredEnvVars()
    const password = await getDbPassword()
    globalForPool.__flonicsMysqlPool = mysql.createPool({
      host: process.env.DB_HOST!,
      port: Number.parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER!,
      password,
      database: process.env.DB_NAME!,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })
  }
  return globalForPool.__flonicsMysqlPool
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const pool = await getPool()
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const results = await query<T>(sql, params)
  return results.length > 0 ? results[0] : null
}
