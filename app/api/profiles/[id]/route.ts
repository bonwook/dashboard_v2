import { type NextRequest, NextResponse } from "next/server"
import { query, queryOne } from "@/lib/db/mysql"
import { verifyToken } from "@/lib/auth"

const VALID_ROLES = ["admin", "staff", "client"] as const

// PATCH /api/profiles/[id] - 역할 등 프로필 일부 필드 수정 (admin/staff 전용)
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

    const actorRole = decoded.role
    const isAdmin = actorRole === "admin"
    const isStaffOrAdmin = actorRole === "admin" || actorRole === "staff"
    if (!isStaffOrAdmin) {
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
        { error: "Invalid role. Must be one of: admin, staff, client" },
        { status: 400 }
      )
    }

    // admin 역할 부여/변경은 admin만 가능
    if (newRole === "admin" && !isAdmin) {
      return NextResponse.json({ error: "admin 역할은 관리자만 변경할 수 있습니다" }, { status: 403 })
    }

    const existing = await queryOne<{ role: string }>(
      "SELECT role FROM profiles WHERE id = ?",
      [id]
    )
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // 자신의 역할을 강등하는 것은 방지 (선택 사항)
    if (decoded.id === id && existing.role === "admin" && newRole !== "admin") {
      return NextResponse.json({ error: "자신의 admin 역할은 제거할 수 없습니다" }, { status: 403 })
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
