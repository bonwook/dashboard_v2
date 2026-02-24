"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FileText,
  Paintbrush,
  LogOut,
  Stethoscope,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { AuthUser } from "@/lib/db/auth"

interface ClientSidebarProps {
  user: AuthUser
}

const navItems = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard },
  { href: "/client/masking", label: "Masking", icon: Paintbrush },
  { href: "/client/progress", label: "Progress", icon: FileText },
  { href: "/client/reports", label: "Reports", icon: FileText },
]

export function ClientSidebar({ user }: ClientSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" })
    router.push("/auth/login")
  }

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex items-center gap-3 border-b p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg overflow-hidden bg-transparent">
          <img
            src="/LOGO.png"
            alt="Flonics Logo"
            className="h-full w-full object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const parent = target.parentElement
              if (parent && !parent.querySelector('.fallback-text')) {
                const fallback = document.createElement('span')
                fallback.className = 'fallback-text text-lg font-bold text-primary'
                fallback.textContent = 'F'
                parent.appendChild(fallback)
              }
            }}
          />
        </div>
        <div>
          <h2 className="text-xl font-bold">Flonics</h2>
          <p className="text-xs text-muted-foreground">Client Portal</p>
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
      </nav>

      <div className="border-t p-3">
        <div className="mb-2 px-3">
          <p className="text-sm font-medium whitespace-nowrap truncate">
            환영합니다 {user.full_name || "고객"}님
          </p>
        </div>
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
