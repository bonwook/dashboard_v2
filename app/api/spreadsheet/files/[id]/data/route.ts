import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { getFileData, saveFileData } from "@/lib/database/spreadsheet"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const { id } = await params
    const { file, rows } = await getFileData(id)
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ file, rows })
  } catch (err) {
    console.error("[spreadsheet/files/[id]/data] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const { id } = await params
    const { headers, rows } = await request.json()
    if (!Array.isArray(headers)) {
      return NextResponse.json({ error: "headers must be an array" }, { status: 400 })
    }
    await saveFileData(id, headers, rows ?? [])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[spreadsheet/files/[id]/data] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
