"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Settings, KeyRound, Mail, Server, Info, Users } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          관리자·스태프용 설정. 접속 경로, 시스템 정보를 확인할 수 있습니다.
        </p>
      </div>

      <div className="space-y-6">
        {/* 사용자 관리 진입 */}
        <Link href="/admin/users">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                사용자 관리
              </CardTitle>
              <CardDescription>
                사용자 목록 조회 및 Staff 가입 요청 검토
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* 접속 경로 및 세션 안내 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              접속 및 권한 안내
            </CardTitle>
            <CardDescription>
              역할별 기본 접속 경로와 세션 정보
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
              <p className="font-medium">역할별 접속 경로</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li><strong className="text-foreground">Admin / Staff</strong>: 로그인 후 /admin (Dashboard, Worklist, Upload, Reports, Settings)</li>
                <li><strong className="text-foreground">Client</strong>: 로그인 후 /client (대시보드, Segmentation, Progress, Excel, Reports)</li>
              </ul>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
              <p className="font-medium">권한 변경 시 참고</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Client → Staff: 해당 사용자는 다음 로그인부터 /admin 영역에 접근할 수 있습니다.</li>
                <li>Staff → Client: 해당 사용자는 /client 영역만 사용하게 됩니다.</li>
                <li>Admin 역할 부여/변경은 Admin 계정으로 로그인한 경우에만 가능합니다.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* AWS S3 (placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              AWS S3 Configuration
            </CardTitle>
            <CardDescription>DICOM 저장용 S3 버킷 설정 (환경 변수로 관리)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bucket">S3 Bucket Name</Label>
              <Input id="bucket" placeholder=".env의 AWS_S3_BUCKET 참고" readOnly className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">AWS Region</Label>
              <Input id="region" placeholder=".env의 AWS_REGION 참고" readOnly className="bg-muted/50" />
            </div>
            <p className="text-xs text-muted-foreground">
              실제 값은 서버 환경 변수에서 설정합니다. 변경이 필요하면 배포 설정을 수정해 주세요.
            </p>
          </CardContent>
        </Card>

        {/* Email (placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Configuration
            </CardTitle>
            <CardDescription>DICOM 수신 등 이메일 관련 설정</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Receiving Email</Label>
              <Input id="email" type="email" placeholder="환경 변수 또는 배포 설정에서 관리" readOnly className="bg-muted/50" />
            </div>
            <p className="text-xs text-muted-foreground">
              이메일 설정은 서버/배포 환경에서 관리됩니다.
            </p>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              System Information
            </CardTitle>
            <CardDescription>시스템 상태 및 버전 정보</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Database Status:</span>
                <span className="font-medium text-green-500">Connected</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">AWS S3 Status:</span>
                <span className="font-medium text-green-500">Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">System Version:</span>
                <span className="font-medium">1.0.0</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
