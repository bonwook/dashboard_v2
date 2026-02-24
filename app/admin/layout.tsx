import type React from "react"
import { AdminNav } from "@/components/admin-nav"
import { StaffPendingSignupAlert } from "@/components/StaffPendingSignupAlert"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Check if user has admin or staff role
  if (user.role !== "admin" && user.role !== "staff") {
    redirect("/client")
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav user={user} />
      <StaffPendingSignupAlert />
      <main>{children}</main>
    </div>
  )
}
