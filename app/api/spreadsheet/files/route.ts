import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { createFile } from "@/lib/database/spreadsheet"

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const { folderId, name } = await request.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    const file = await createFile(folderId ?? null, name.trim(), decoded.id)
    return NextResponse.json(file, { status: 201 })
  } catch (err) {
    console.error("[spreadsheet/files] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
