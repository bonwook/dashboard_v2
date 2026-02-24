"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Users, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type Role = "admin" | "staff" | "client"

interface Profile {
  id: string
  email: string
  full_name: string | null
  organization: string | null
  role: string
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
  client: "Client",
}

export function RoleSettingsSection() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const { toast } = useToast()

  const isAdmin = currentUserRole === "admin"

  const loadProfiles = async () => {
    try {
      const res = await fetch("/api/profiles", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load profiles")
      const data = await res.json()
      setProfiles(Array.isArray(data) ? data : data.profiles || [])
    } catch (e) {
      console.error(e)
      toast({
        title: "오류",
        description: "사용자 목록을 불러오지 못했습니다.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const loadMe = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const me = await res.json()
          setCurrentUserRole(me.role || null)
        }
      } catch (_) {}
    }
    loadMe()
    loadProfiles()
  }, [])

  const changeRole = async (userId: string, newRole: Role) => {
    setUpdatingId(userId)
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
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, role: newRole } : p))
      )
      toast({
        title: "저장됨",
        description: `역할이 ${ROLE_LABELS[newRole]}(으)로 변경되었습니다.`,
      })
    } catch (e) {
      toast({
        title: "오류",
        description: "역할 변경에 실패했습니다.",
        variant: "destructive",
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const getRoleBadge = (role: string) => {
    const r = role as Role
    const config: Record<Role, { label: string; className: string }> = {
      admin: { label: "Admin", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
      staff: { label: "Staff", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      client: { label: "Client", className: "bg-green-500/10 text-green-500 border-green-500/20" },
    }
    const { label, className } = config[r] || config.client
    return <Badge className={className}>{label}</Badge>
  }

  const allowedRoles: Role[] = isAdmin ? ["admin", "staff", "client"] : ["staff", "client"]

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          사용자 권한 관리
        </CardTitle>
        <CardDescription>
          Client ↔ Staff 역할 변경. Admin 역할 변경은 관리자(Admin)만 가능합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>현재 역할</TableHead>
                <TableHead className="w-[180px]">변경할 역할</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell>{getRoleBadge(p.role)}</TableCell>
                  <TableCell>
                    <Select
                      value={p.role}
                      onValueChange={(v) => changeRole(p.id, v as Role)}
                      disabled={updatingId === p.id}
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
                    {updatingId === p.id && (
                      <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {profiles.length === 0 && (
          <p className="text-center text-muted-foreground py-6">등록된 사용자가 없습니다.</p>
        )}
      </CardContent>
    </Card>
  )
}
