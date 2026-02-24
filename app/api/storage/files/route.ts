import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { listFiles } from "@/lib/aws/s3"

// GET /api/storage/files - 사용자 파일 목록 조회 (S3에서 실시간 조회)
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const decoded = verifyToken(token)
    
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const fileType = searchParams.get("fileType") // excel, pdf, dicom (null이면 전체)

    // S3에서 실시간으로 파일 목록 조회 (사용자별 prefix)
    // fileType이 null이면 모든 파일 타입 조회
    const userId = decoded.id
    const s3Prefix = fileType ? `${userId}/${fileType}/` : `${userId}/`
    
    const s3Files = await listFiles(s3Prefix)

    // S3File 형식으로 변환
    const formattedFiles = s3Files.map((s3File) => {
      // s3_key에서 폴더 경로 추출 (계층구조 표시용)
      const keyParts = s3File.key.split('/')
      const folderPath = keyParts.length > 1 ? keyParts.slice(0, -1).join('/') : ''
      const fileName = keyParts[keyParts.length - 1]
      
      // S3 키에서 파일 타입 추출 (userId/fileType/... 형식 또는 파일 확장자)
      const keyPartsForType = s3File.key.split('/')
      let detectedFileType = 'other'
      const fileExtension = fileName.toLowerCase().split('.').pop()
      
      // 파일 확장자로 먼저 확인
      if (fileExtension === 'csv') {
        detectedFileType = 'excel' // CSV는 excel 타입으로 분류
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        detectedFileType = 'excel'
      } else if (fileExtension === 'pdf') {
        detectedFileType = 'pdf'
      } else if (fileExtension === 'dcm' || fileExtension === 'dicom') {
        detectedFileType = 'dicom'
      } else if (keyPartsForType.length >= 2) {
        // 확장자로 확인 안되면 경로에서 확인
        const typeFromKey = keyPartsForType[1]
        if (typeFromKey === 'excel' || typeFromKey === 'pdf' || typeFromKey === 'dicom') {
          detectedFileType = typeFromKey
        }
      }
      
      const formatted = {
        key: s3File.key,
        size: s3File.size || 0,
        lastModified: s3File.lastModified || new Date(),
        contentType: s3File.contentType,
        fileName: fileName,
        filePath: `s3://${process.env.AWS_S3_BUCKET_NAME}/${s3File.key}`,
        fileType: detectedFileType,
        folderPath: folderPath,
      }
      
      return formatted
    })

    return NextResponse.json({ files: formattedFiles })
  } catch (error) {
    console.error("[Files API] Error listing files:", error)
    const err = error as { name?: string; message?: string }
    const isCredentialsError =
      err?.name === "CredentialsProviderError" ||
      String(err?.message || "").includes("session has expired") ||
      String(err?.message || "").includes("reauthenticate")
    const message = isCredentialsError
      ? "AWS 자격 증명이 만료되었거나 설정되지 않았습니다. 관리자에게 문의하세요."
      : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

