import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import {
  getStaffSignupRequestById,
  deleteStaffSignupRequestById,
} from "@/lib/database/staff-signup-requests"

/** Staff 가입 요청 거부: 해당 요청 삭제 */
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

  await deleteStaffSignupRequestById(id)
  return NextResponse.json({ success: true })
}
