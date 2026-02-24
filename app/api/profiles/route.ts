import { type NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db/mysql"
import { verifyToken } from "@/lib/auth"
import {
  ensureStaffSignupRequestsTable,
  getPendingStaffSignupRequests,
} from "@/lib/database/staff-signup-requests"

// GET /api/profiles - 프로필 조회 (admin/staff일 때 Staff 가입 대기 목록 포함)
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const email = searchParams.get("email")
    const role = searchParams.get("role")

    let sql = "SELECT id, email, full_name, organization, role, created_at FROM profiles WHERE 1=1"
    const params: (string | null)[] = []

    if (id) {
      sql += " AND id = ?"
      params.push(id)
    }
    if (email) {
      sql += " AND email = ?"
      params.push(email)
    }
    if (role) {
      sql += " AND role = ?"
      params.push(role)
    }

    sql += " ORDER BY created_at DESC"
    const profiles = await query(sql, params)

    const isAdminOrStaff = decoded.role === "admin" || decoded.role === "staff"
    if (!isAdminOrStaff) {
      return NextResponse.json(profiles)
    }

    await ensureStaffSignupRequestsTable()
    const pendingStaffRequests = await getPendingStaffSignupRequests()

    return NextResponse.json({
      profiles,
      pendingStaffRequests,
    })
  } catch (error) {
    console.error("[v0] Error fetching profiles:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


