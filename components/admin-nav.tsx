"use client"

import { Button } from "@/components/ui/button"
import { LayoutDashboard, Upload, Activity, FileText, LogOut, Box, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import type { AuthUser } from "@/lib/db/auth"

interface AdminNavProps {
  user: AuthUser
}

export function AdminNav({ user }: AdminNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" })
    router.push("/auth/login")
  }

  return (
    <nav className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg">
              <Image 
                src="/LOGO.png" 
                alt="Flonics Logo" 
                width={36} 
                height={36}
                className="object-contain"
              />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-none">Flonics</h2>
              <p className="text-xs text-muted-foreground">4D Flow MRI Analysis</p>
            </div>
          </Link>
          <div className="flex items-center gap-0">
            <Button
              variant={pathname === "/admin" ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname === "/admin"
                  ? "bg-primary text-primary-foreground rounded-r-none"
                  : "rounded-r-none"
              }
            >
              <Link href="/admin">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={pathname.startsWith("/admin/cases") ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname.startsWith("/admin/cases")
                  ? "bg-primary text-primary-foreground rounded-none"
                  : "rounded-none"
              }
            >
              <Link href="/admin/cases">
                <Activity className="mr-2 h-4 w-4" />
                Worklist
              </Link>
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={pathname.startsWith("/admin/file-upload") ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname.startsWith("/admin/file-upload")
                  ? "bg-primary text-primary-foreground rounded-none"
                  : "rounded-none"
              }
            >
              <Link href="/admin/file-upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Link>
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={pathname.startsWith("/admin/reports") ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname.startsWith("/admin/reports")
                  ? "bg-primary text-primary-foreground rounded-none"
                  : "rounded-none"
              }
            >
              <Link href="/admin/reports">
                <FileText className="mr-2 h-4 w-4" />
                Reports
              </Link>
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={pathname.startsWith("/admin/settings") ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname.startsWith("/admin/settings")
                  ? "bg-primary text-primary-foreground rounded-r-none"
                  : "rounded-r-none"
              }
            >
              <Link href="/admin/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user.role === "admin" && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="https://15.164.184.250/" target="_blank" rel="noopener noreferrer">
                  <Box className="mr-2 h-4 w-4" />
                  Streamliner
                </Link>
              </Button>
              <div className="h-6 w-px bg-border" />
            </>
          )}
          <p className="text-sm font-medium whitespace-nowrap max-w-[200px] truncate">
            {user.full_name || "Staff"}님
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground whitespace-nowrap"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </nav>
  )
}
