import type React from "react"
import { RequireRole } from "@/components/auth/require-role"

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  return <RequireRole role="admin">{children}</RequireRole>
}
