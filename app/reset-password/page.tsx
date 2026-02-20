"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function ResetPasswordRequestPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email) {
      setError("Ingresá tu email.")
      return
    }

    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const currentOrigin = typeof window !== "undefined" ? window.location.origin : ""
      const redirectBase =
        currentOrigin && !currentOrigin.includes("localhost") && !currentOrigin.includes("127.0.0.1")
          ? currentOrigin
          : "https://getoba-labas.vercel.app"

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBase}/reset-password/confirm`,
      })

      if (error) {
        setError(error.message)
        return
      }

      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>
            Ingresá el email de tu cuenta y te enviaremos un enlace para restablecer tu contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Si el email corresponde a una cuenta válida, vas a recibir un enlace para restablecer tu contraseña en
                unos minutos.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                Volver al inicio de sesión
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tuemail@ejemplo.com"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar enlace"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                Volver al inicio de sesión
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
