import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import {
  ensureStaffSignupRequestsTable,
  getPendingStaffSignupCount,
  getPendingStaffSignupRequests,
} from "@/lib/database/staff-signup-requests"

/**
 * Staff/Admin 전용: Staff 가입 대기 요청 건수 및 목록 조회
 */
export async function GET() {
  const cookieStore = await cookies()
  const authToken = cookieStore.get("auth-token")?.value

  if (!authToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = verifyToken(authToken)
  if (!user || (user.role !== "staff" && user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    await ensureStaffSignupRequestsTable()
    const [count, requests] = await Promise.all([
      getPendingStaffSignupCount(),
      getPendingStaffSignupRequests(),
    ])
    return NextResponse.json({ count, requests })
  } catch (e) {
    console.error("pending-staff GET error:", e)
    return NextResponse.json(
      { error: "Failed to load pending staff signup requests" },
      { status: 500 },
    )
  }
}
