"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export default function AdminStatsToolsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<"none" | "dedup" | "recalc" | "autofix">("none")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token ?? null
      setAccessToken(token)
    })
  }, [])

  async function callEndpoint(path: string, kind: "dedup" | "recalc" | "autofix") {
    try {
      setLoading(kind)
      setMessage(null)
      setError(null)

      if (!accessToken) {
        setError("No hay sesión válida. Volvé a iniciar sesión como administrador.")
        return
      }

      const res = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Error al ejecutar la operación")
        return
      }

      setMessage(JSON.stringify(data, null, 2))
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido"
      setError(msg)
    } finally {
      setLoading("none")
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 flex justify-center">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Herramientas de estadísticas</h1>
          <Button variant="outline" onClick={() => router.back()}>
            Volver
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Limpieza de eventos duplicados</CardTitle>
            <CardDescription>
              Elimina acciones duplicadas/triplicadas/cuadruplicadas en el historial de todos los partidos
              <strong> finalizados</strong>, manteniendo solo la primera ocurrencia de cada jugada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="destructive"
              disabled={loading !== "none"}
              onClick={() => callEndpoint("/api/admin/matches/dedup-events", "dedup")}
            >
              {loading === "dedup" ? "Limpiando..." : "Limpiar eventos duplicados"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recalcular estadísticas</CardTitle>
            <CardDescription>
              Recalcula las estadísticas por jugadora (match_player_stats) para todos los partidos
              <strong> finalizados</strong>. Debe ejecutarse después de limpiar los eventos duplicados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="default"
              disabled={loading !== "none"}
              onClick={() => callEndpoint("/api/admin/matches/recalc-all-stats", "recalc")}
            >
              {loading === "recalc" ? "Recalculando..." : "Recalcular estadísticas"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-fix estadísticas</CardTitle>
            <CardDescription>
              Aplica límites razonables (minutos y tiros intentados) por jugadora y ajusta los puntos para que los
              totales de cada equipo coincidan exactamente con el resultado oficial del partido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="default"
              disabled={loading !== "none"}
              onClick={() => callEndpoint("/api/admin/matches/auto-fix-stats", "autofix")}
            >
              {loading === "autofix" ? "Aplicando auto-fix..." : "Auto-fix estadísticas"}
            </Button>
          </CardContent>
        </Card>

        {(message || error) && (
          <Card>
            <CardHeader>
              <CardTitle>Resultado</CardTitle>
            </CardHeader>
            <CardContent>
              {error && <pre className="text-sm text-red-600 whitespace-pre-wrap break-words">{error}</pre>}
              {message && !error && (
                <pre className="text-xs whitespace-pre-wrap break-words bg-muted p-3 rounded-md overflow-x-auto">
                  {message}
                </pre>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
