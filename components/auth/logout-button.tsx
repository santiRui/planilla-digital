"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace("/login")
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
      <LogOut className="h-4 w-4" />
      <span>Cerrar sesión</span>
    </Button>
  )
}
