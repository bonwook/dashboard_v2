import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import { createUserWithHash, getUserByEmail } from "@/lib/db/auth"
import {
  getStaffSignupRequestById,
  deleteStaffSignupRequestById,
} from "@/lib/database/staff-signup-requests"

/** Staff 가입 요청 승인: profiles에 staff로 생성 후 대기 요청 삭제 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const user = verifyToken(token)
  if (!user || (user.role !== "staff" && user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: "Missing request id" }, { status: 400 })
  }

  const requestRow = await getStaffSignupRequestById(id)
  if (!requestRow) {
    return NextResponse.json({ error: "Pending staff request not found" }, { status: 404 })
  }

  const existing = await getUserByEmail(requestRow.email)
  if (existing) {
    await deleteStaffSignupRequestById(id)
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 },
    )
  }

  await createUserWithHash(
    requestRow.email,
    requestRow.password_hash,
    requestRow.full_name ?? undefined,
    requestRow.organization ?? undefined,
    "staff",
  )
  await deleteStaffSignupRequestById(id)

  return NextResponse.json({ success: true })
}
