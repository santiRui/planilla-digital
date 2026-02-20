"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function ResetPasswordConfirmPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    // Al llegar desde el link del email, Supabase debería adjuntar el session en la URL
    // Este llamado fuerza a inicializar la sesión en el cliente.
    supabase.auth.getSession().then(() => {
      setReady(true)
    })
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password || !confirmPassword) {
      setError("Ingresá y confirmá la nueva contraseña.")
      return
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.")
      return
    }

    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setError(error.message)
        return
      }

      router.replace("/login")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Definir nueva contraseña</CardTitle>
          <CardDescription>
            Elegí una nueva contraseña para tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-sm text-muted-foreground">Preparando el formulario...</p>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
