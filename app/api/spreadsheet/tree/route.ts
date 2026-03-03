import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { getAllFolders, getAllFiles } from "@/lib/database/spreadsheet"

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const [folders, files] = await Promise.all([getAllFolders(), getAllFiles()])
    return NextResponse.json({ folders, files })
  } catch (err) {
    console.error("[spreadsheet/tree] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
