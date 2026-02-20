"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { z } from "zod"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type UserRole = "admin" | "arbitro" | "oficial_mesa"

function roleHome(role: UserRole) {
  if (role === "admin") return "/admin"
  if (role === "arbitro") return "/arbitros"
  return "/mesa"
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsed = schema.safeParse({ email, password })
    if (!parsed.success) {
      setError("Revisá email y contraseña.")
      return
    }

    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      })

      if (signInError || !data.user) {
        setError(signInError?.message ?? "No se pudo iniciar sesión")
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle()

      if (profileError || !profile?.role) {
        setError("No se pudo obtener el rol del usuario")
        return
      }

      router.replace(roleHome(profile.role as UserRole))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Acceso para Administración, Árbitros y Mesa</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>

            <div className="text-center">
              <Link className="text-sm text-muted-foreground underline underline-offset-4" href="/reset-password">
                Olvidé mi contraseña
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
