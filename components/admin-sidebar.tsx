"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Upload,
  Activity,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Stethoscope,
  Users,
  Shield,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/cases", label: "Worklist", icon: Activity },
  { href: "/admin/analytics", label: "Work", icon: BarChart3 },
  { href: "/admin/file-upload", label: "Upload", icon: Upload },
  { href: "/admin/progress", label: "Progress", icon: FileText },
  { href: "/admin/reports", label: "Reports", icon: FileText },
]

const adminOnlyItems = [
  { href: "/admin/users", label: "User Management", icon: Users },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Get user role from API
        const response = await fetch("/api/auth/me", { credentials: "include" })
        if (response.ok) {
          const userData = await response.json()
          setUserRole(userData.role || null)
        }
      } catch (error) {
        console.error("Failed to load user:", error)
      }
    }
    loadUser()
  }, [])

  const handleLogout = async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" })
    router.push("/auth/login")
  }

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex items-center gap-3 border-b p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Stethoscope className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Flonics</h2>
          <p className="text-xs text-muted-foreground">4D Flow MRI Analysis</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Main Menu</div>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 transition-all",
                  isActive && "bg-primary text-primary-foreground shadow-sm",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{item.label}</span>
              </Button>
            </Link>
          )
        })}
        
        {(userRole === "admin" || userRole === "staff") && (
          <>
            <div className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Shield className="h-3 w-3" />
              Admin / Staff
            </div>
            {adminOnlyItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-3 transition-all",
                      isActive && "bg-primary text-primary-foreground shadow-sm",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{item.label}</span>
                  </Button>
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="border-t p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          <span className="font-medium">Logout</span>
        </Button>
      </div>
    </div>
  )
}
