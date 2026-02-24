import { randomUUID } from "crypto"
import type { NextRequest } from "next/server"
import { query } from "@/lib/db/mysql"

function getClientIp(request?: NextRequest): string | null {
  if (!request) return null
  const xf = request.headers.get("x-forwarded-for")
  if (xf) return xf.split(",")[0].trim()
  const xr = request.headers.get("x-real-ip")
  if (xr) return xr.trim()
  return null
}

/**
 * Best-effort audit logger.
 * - If audit_log table/columns aren't present, it fails silently (won't break requests).
 * - Stores task_id in a column if present; otherwise stores it in details JSON.
 */
export async function writeAuditLog(args: {
  request?: NextRequest
  userId: string | null
  action: string
  taskId?: string | null
  details?: Record<string, unknown>
}) {
  const { request, userId, action, taskId, details } = args

  try {
    // Check table existence
    const tableRows = await query(
      `SELECT COUNT(*) as cnt
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'audit_log'`
    )
    const hasTable = Number((tableRows as any)?.[0]?.cnt || 0) > 0
    if (!hasTable) return

    // Check columns
    const cols = await query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'audit_log'
         AND COLUMN_NAME IN ('task_id', 'case_id', 'user_id', 'action', 'details', 'ip_address', 'user_agent')`
    )
    const colSet = new Set((cols as any[]).map((r) => r.COLUMN_NAME))

    const ip = getClientIp(request)
    const userAgent = request?.headers.get("user-agent") || null

    const finalDetails: Record<string, unknown> = {
      ...(details || {}),
    }
    if (!colSet.has("task_id") && taskId) {
      finalDetails.task_id = taskId
    }

    const insertCols: string[] = ["id"]
    const insertVals: any[] = [randomUUID()]

    if (colSet.has("task_id")) {
      insertCols.push("task_id")
      insertVals.push(taskId || null)
    } else if (colSet.has("case_id")) {
      // legacy schema
      insertCols.push("case_id")
      insertVals.push(null)
    }

    if (colSet.has("user_id")) {
      insertCols.push("user_id")
      insertVals.push(userId)
    }
    insertCols.push("action")
    insertVals.push(action)

    if (colSet.has("details")) {
      insertCols.push("details")
      insertVals.push(JSON.stringify(finalDetails))
    }
    if (colSet.has("ip_address")) {
      insertCols.push("ip_address")
      insertVals.push(ip)
    }
    if (colSet.has("user_agent")) {
      insertCols.push("user_agent")
      insertVals.push(userAgent)
    }

    const placeholders = insertCols.map(() => "?").join(", ")
    await query(
      `INSERT INTO audit_log (${insertCols.join(", ")}) VALUES (${placeholders})`,
      insertVals
    )
  } catch {
    // best-effort: never break the main request
  }
}

