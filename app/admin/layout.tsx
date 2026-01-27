import type React from "react"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import RequireAdmin from "./require-admin"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <div className="flex min-h-screen bg-background">
        <AdminSidebar />
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto p-4 lg:p-6 pt-16 lg:pt-6">{children}</div>
        </main>
      </div>
    </RequireAdmin>
  )
}
