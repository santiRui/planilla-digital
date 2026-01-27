"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { UserRole } from "@/lib/types"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type Props = {
  role: UserRole
  children: React.ReactNode
}

function roleHome(role: UserRole) {
  if (role === "admin") return "/admin"
  if (role === "arbitro") return "/arbitros"
  return "/mesa"
}

export function RequireRole({ role, children }: Props) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session

      if (!session?.user) {
        router.replace("/login")
        return
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle()

      if (error || !profile?.role) {
        router.replace("/login")
        return
      }

      if (profile.role !== role) {
        router.replace(roleHome(profile.role))
        return
      }

      setAllowed(true)
    }

    run()
  }, [role, router])

  if (!allowed) return null

  return children
}
