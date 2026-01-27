import type React from "react"
import { RequireRole } from "@/components/auth/require-role"

export default function MesaLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole role="oficial_mesa">{children}</RequireRole>
}
