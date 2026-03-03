import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { createFolder } from "@/lib/database/spreadsheet"

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const { parentId, name } = await request.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    const folder = await createFolder(parentId ?? null, name.trim(), decoded.id)
    return NextResponse.json(folder, { status: 201 })
  } catch (err) {
    console.error("[spreadsheet/folders] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
