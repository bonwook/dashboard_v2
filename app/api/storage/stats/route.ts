import { type NextRequest, NextResponse } from "next/server"
import { verifyToken, getUserById } from "@/lib/db/auth"
import { listFiles } from "@/lib/aws/s3"

// GET /api/storage/stats - 사용자별 S3 파일 타입별 통계
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

    // S3에서 사용자별 모든 파일 조회
    const userId = decoded.id
    
    // 데이터베이스에서 사용자 정보 가져오기
    const userInfo = await getUserById(userId)
    
    // 일반 파일 경로: {userId}/
    const s3Prefix = `${userId}/`
    const s3Files = await listFiles(s3Prefix)
    
    // dicom 파일 경로: temp/Dicom/{userId}/
    const dicomPrefix = `temp/Dicom/${userId}/`
    const dicomFiles = await listFiles(dicomPrefix)
    
    // 실제 파일만 필터링 (폴더 제외, 확장자가 있는 파일만)
    const actualFiles = s3Files.filter((file) => {
      const keyParts = file.key.split('/')
      const fileName = keyParts[keyParts.length - 1]
      // 파일명에 확장자가 있고, 크기가 0보다 큰 경우만 (폴더는 보통 크기가 0)
      return fileName.includes('.') && file.size > 0
    })

    // dicom 파일 필터링
    const actualDicomFiles = dicomFiles.filter((file) => {
      const keyParts = file.key.split('/')
      const fileName = keyParts[keyParts.length - 1]
      return fileName.includes('.') && file.size > 0
    })


    // 파일 타입별 용량 통계 계산 (바이트 단위)
    const stats = {
      excel: 0,
      pdf: 0,
      zip: 0,
      dicom: 0,
      nifti: 0,
      other: 0,
    }

    // 일반 파일 처리 (nifti 포함)
    actualFiles.forEach((s3File) => {
      const keyParts = s3File.key.split('/')
      const fileName = keyParts[keyParts.length - 1]
      const fileNameLower = fileName.toLowerCase()
      const fileExtension = fileNameLower.split('.').pop() || ''
      const fileSize = s3File.size || 0
      
      // nifti 파일 체크 (.nii.gz 먼저 확인)
      if (fileNameLower.endsWith('.nii.gz') || fileExtension === 'nii' || fileExtension === 'nifti') {
        stats.nifti += fileSize
        return
      }
      
      // 파일 확장자로 타입 확인하고 용량 합산
      if (fileExtension === 'csv' || fileExtension === 'xlsx' || fileExtension === 'xls') {
        stats.excel += fileSize
      } else if (fileExtension === 'pdf') {
        stats.pdf += fileSize
      } else if (fileExtension === 'zip' || fileExtension === 'rar' || fileExtension === '7z' || fileExtension === 'gz') {
        stats.zip += fileSize
      } else {
        // 경로에서도 확인
        if (keyParts.length >= 2) {
          const typeFromKey = keyParts[1]
          if (typeFromKey === 'excel') {
            stats.excel += fileSize
          } else if (typeFromKey === 'pdf') {
            stats.pdf += fileSize
          } else if (typeFromKey === 'zip') {
            stats.zip += fileSize
          } else {
            stats.other += fileSize
          }
        } else {
          stats.other += fileSize
        }
      }
    })

    // dicom 파일 처리 (temp/Dicom/{userId}/ 경로)
    actualDicomFiles.forEach((dicomFile) => {
      stats.dicom += dicomFile.size || 0
    })


    // 디버깅 정보 포함하여 반환
    return NextResponse.json({ 
      stats,
      user: userInfo ? {
        id: userInfo.id,
        email: userInfo.email,
        full_name: userInfo.full_name,
        organization: userInfo.organization,
      } : null,
      debug: {
        userId,
        s3Prefix,
        dicomPrefix,
        s3BucketName: process.env.AWS_S3_BUCKET_NAME || 'N/A',
        totalFiles: s3Files.length,
        actualFiles: actualFiles.length,
        totalDicomFiles: dicomFiles.length,
        actualDicomFiles: actualDicomFiles.length,
        fileList: actualFiles.map(f => ({
          key: f.key,
          size: f.size,
          lastModified: f.lastModified.toISOString()
        }))
      }
    })
  } catch (error) {
    console.error("[Storage Stats API] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

