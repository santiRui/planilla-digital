import type React from "react"
import { RequireRole } from "@/components/auth/require-role"

export default function ArbitrosLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole role="arbitro">{children}</RequireRole>
}
