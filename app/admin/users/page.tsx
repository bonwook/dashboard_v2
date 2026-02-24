"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Users, Shield, User, UserCog, Check, X, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type Role = "admin" | "staff" | "client"

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
  client: "Client",
}

type PendingStaffRequest = {
  id: string
  email: string
  full_name: string | null
  organization: string | null
  created_at: string
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([])
  const [pendingStaffRequests, setPendingStaffRequests] = useState<PendingStaffRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null)
  const { toast } = useToast()

  const isAdmin = userRole === "admin"
  const allowedRoles: Role[] = isAdmin ? ["admin", "staff", "client"] : ["staff", "client"]

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" })
        if (!response.ok) return
        const userData = await response.json()
        setUserRole(userData.role)
        if (userData.role === "admin" || userData.role === "staff") {
          loadUsers()
        }
      } catch (error) {
        console.error("Failed to load user:", error)
      }
    }
    loadUser()
  }, [])

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/profiles", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        const profiles = Array.isArray(data) ? data : data.profiles ?? []
        const pending = Array.isArray(data) ? [] : data.pendingStaffRequests ?? []
        setUsers(profiles)
        setPendingStaffRequests(pending)
      } else {
        toast({
          title: "Error",
          description: "Failed to load users",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to load users:", error)
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    setActioningId(id)
    try {
      const res = await fetch(`/api/notifications/pending-staff/${id}/approve`, {
        method: "POST",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: "승인 실패",
          description: data.error || "Failed to approve",
          variant: "destructive",
        })
        return
      }
      toast({ title: "승인 완료", description: "Staff 계정이 생성되었습니다." })
      await loadUsers()
    } finally {
      setActioningId(null)
    }
  }

  const handleReject = async (id: string) => {
    setActioningId(id)
    try {
      const res = await fetch(`/api/notifications/pending-staff/${id}/reject`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) {
        toast({
          title: "거부 실패",
          description: "Failed to reject",
          variant: "destructive",
        })
        return
      }
      toast({ title: "거부 완료", description: "해당 가입 요청이 삭제되었습니다." })
      await loadUsers()
    } finally {
      setActioningId(null)
    }
  }

  const changeRole = async (userId: string, newRole: Role) => {
    setUpdatingRoleId(userId)
    try {
      const res = await fetch(`/api/profiles/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: "역할 변경 실패",
          description: data.error || "다시 시도해 주세요.",
          variant: "destructive",
        })
        return
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      )
      toast({
        title: "저장됨",
        description: `역할이 ${ROLE_LABELS[newRole]}(으)로 변경되었습니다.`,
      })
    } catch {
      toast({
        title: "오류",
        description: "역할 변경에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      setUpdatingRoleId(null)
    }
  }

  const getRoleBadge = (role: string, isPending?: boolean) => {
    if (isPending) {
      return (
        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
          Staff (대기)
        </Badge>
      )
    }
    const roleConfig = {
      admin: { label: "Admin", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
      staff: { label: "Staff", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      client: { label: "Client", className: "bg-green-500/10 text-green-500 border-green-500/20" },
    }
    const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.client
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="h-4 w-4" />
      case "staff":
        return <UserCog className="h-4 w-4" />
      default:
        return <User className="h-4 w-4" />
    }
  }

  if (userRole != null && userRole !== "admin" && userRole !== "staff") {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Access Denied</p>
            <p className="text-sm text-muted-foreground">관리자 또는 Staff만 접근할 수 있습니다.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-2">사용자 계정 조회 및 관리</p>
        </div>
        <Button onClick={loadUsers} disabled={isLoading}>
          <Users className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Staff 가입 대기</CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {pendingStaffRequests.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">
              {users.filter((u) => u.role === "admin").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            사용자 권한 관리
          </CardTitle>
          <CardDescription>
            사용자 목록 조회, 역할 변경(Client ↔ Staff), Staff 가입 요청 승인/거부
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : users.length > 0 || pendingStaffRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>현재 역할</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="w-[180px]">변경할 역할</TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.organization || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getRoleIcon(user.role)}
                          {getRoleBadge(user.role)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(v) => changeRole(user.id, v as Role)}
                          disabled={updatingRoleId === user.id}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="역할 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {updatingRoleId === user.id && (
                          <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                  {pendingStaffRequests.map((req) => (
                    <TableRow key={`pending-${req.id}`} className="bg-amber-50/50 dark:bg-amber-950/20">
                      <TableCell className="font-medium">{req.full_name || "—"}</TableCell>
                      <TableCell>{req.email}</TableCell>
                      <TableCell>{req.organization || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserCog className="h-4 w-4" />
                          {getRoleBadge("staff", true)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {req.created_at
                          ? new Date(req.created_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">승인 후 역할 설정</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8"
                            disabled={actioningId !== null}
                            onClick={() => handleApprove(req.id)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={actioningId !== null}
                            onClick={() => handleReject(req.id)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            거부
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">등록된 사용자가 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

