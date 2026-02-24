"use client"

import { Button } from "@/components/ui/button"
import { FileText, Home, LogOut, FileSpreadsheet, Paintbrush } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { AuthUser } from "@/lib/db/auth"

interface ClientNavProps {
  user: AuthUser
}

export function ClientNav({ user }: ClientNavProps) {
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
          <Link href="/client" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden bg-transparent">
              <img
                src="/LOGO.png"
                alt="Flonics Logo"
                className="h-full w-full object-contain"
                onError={(e) => {
                  // Fallback to text if image fails to load
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
              <h2 className="text-lg font-bold leading-none">Flonics</h2>
              <p className="text-xs text-muted-foreground">Client Portal</p>
            </div>
          </Link>
          <div className="flex items-center gap-0">
            <Button
              variant={pathname === "/client" ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname === "/client"
                  ? "bg-primary text-primary-foreground rounded-r-none"
                  : "rounded-r-none"
              }
            >
              <Link href="/client">
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={pathname.startsWith("/client/segmentation") ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname.startsWith("/client/segmentation")
                  ? "bg-primary text-primary-foreground rounded-none"
                  : "rounded-none"
              }
            >
              <Link href="/client/masking">
                <Paintbrush className="mr-2 h-4 w-4" />
                Masking
              </Link>
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={pathname.startsWith("/client/progress") ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname.startsWith("/client/progress")
                  ? "bg-primary text-primary-foreground rounded-none"
                  : "rounded-none"
              }
            >
              <Link href="/client/progress">
                <FileText className="mr-2 h-4 w-4" />
                Progress
              </Link>
            </Button>
            <div className="h-6 w-px bg-border hidden" />
            <Button
              variant={pathname.startsWith("/client/excel") ? "default" : "ghost"}
              asChild
              size="sm"
              className={`hidden ${
                pathname.startsWith("/client/excel")
                  ? "bg-primary text-primary-foreground rounded-none"
                  : "rounded-none"
              }`}
            >
              <Link href="/client/excel">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Excel
              </Link>
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant={pathname.startsWith("/client/reports") ? "default" : "ghost"}
              asChild
              size="sm"
              className={
                pathname.startsWith("/client/reports")
                  ? "bg-primary text-primary-foreground rounded-l-none"
                  : "rounded-l-none"
              }
            >
              <Link href="/client/reports">
                <FileText className="mr-2 h-4 w-4" />
                Reports
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm font-medium whitespace-nowrap max-w-[200px] truncate">
            환영합니다 {user.full_name || "고객"}님
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
