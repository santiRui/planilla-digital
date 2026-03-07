"use client"

import type React from "react"
import { Suspense, useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
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
  return (
    <Suspense fallback={null}>
      <RequireRoleInner role={role}>{children}</RequireRoleInner>
    </Suspense>
  )
}

function RequireRoleInner({ role, children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
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

      // Bypass: permitir acceso a pre-planilla desde flujos que agregan forcePre=1
      // (ej: "Empezar acta nueva" / "Cargar nueva planilla").
      if (role === "oficial_mesa") {
        const forcePre = searchParams.get("forcePre") === "1"
        const isPrePlanillaPath = pathname.startsWith("/mesa/planilla/") && pathname.endsWith("/pre")
        if (forcePre && isPrePlanillaPath) {
          setAllowed(true)
          return
        }
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle()

      const rawProfile = profile as any
      if (error || !rawProfile?.role) {
        router.replace("/login")
        return
      }

      // Permitir que cuentas con rol 'arbitro' accedan también a vistas que requieren 'oficial_mesa'
      // (caso de usuarios que cumplen ambos roles con la misma cuenta).
      if (rawProfile.role !== role) {
        const isArbitroUsingMesa = role === "oficial_mesa" && rawProfile.role === "arbitro"
        if (!isArbitroUsingMesa) {
          router.replace(roleHome(rawProfile.role))
          return
        }
      }

      setAllowed(true)
    }

    run()
  }, [pathname, role, router, searchParams])

  if (!allowed) return null

  return children
}
