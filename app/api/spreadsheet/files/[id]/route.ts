import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { renameFile, deleteFile } from "@/lib/database/spreadsheet"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const { id } = await params
    const { name } = await request.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    await renameFile(id, name.trim())
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[spreadsheet/files/[id]] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const { id } = await params
    await deleteFile(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[spreadsheet/files/[id]] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
