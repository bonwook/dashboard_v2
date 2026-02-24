import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import { writeAuditLog } from "@/lib/db/audit"

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    const decoded = token ? verifyToken(token) : null

    await writeAuditLog({
      request,
      userId: decoded?.id || null,
      action: "auth.signout",
      details: decoded ? { email: decoded.email, role: decoded.role } : undefined,
    })

    cookieStore.delete("auth-token")

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to sign out" }, { status: 500 })
  }
}
