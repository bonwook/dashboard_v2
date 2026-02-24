import { type NextRequest, NextResponse } from "next/server"
import { query, queryOne } from "@/lib/db/mysql"
import { verifyToken } from "@/lib/auth"

const VALID_ROLES = ["staff", "client"] as const

// PATCH /api/profiles/[id] - 역할 등 프로필 일부 필드 수정 (staff 전용)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    if (decoded.role !== "staff") {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "User id required" }, { status: 400 })
    }

    const body = await request.json()
    const newRole = typeof body.role === "string" ? body.role.trim() : undefined

    if (!newRole || !VALID_ROLES.includes(newRole as typeof VALID_ROLES[number])) {
      return NextResponse.json(
        { error: "Invalid role. Must be one of: staff, client" },
        { status: 400 }
      )
    }

    const existing = await queryOne<{ role: string }>(
      "SELECT role FROM profiles WHERE id = ?",
      [id]
    )
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    await query(
      "UPDATE profiles SET role = ?, updated_at = NOW() WHERE id = ?",
      [newRole, id]
    )

    return NextResponse.json({ ok: true, role: newRole })
  } catch (error) {
    console.error("[profiles] PATCH error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
