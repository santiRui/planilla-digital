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
  const [fakeMatchId, setFakeMatchId] = useState("")
  const [fakeHomeScore, setFakeHomeScore] = useState("")
  const [fakeAwayScore, setFakeAwayScore] = useState("")
  const [fakeClearExisting, setFakeClearExisting] = useState(true)

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

  async function callFakeStats() {
    try {
      setLoading("autofix")
      setMessage(null)
      setError(null)

      if (!accessToken) {
        setError("No hay sesión válida. Volvé a iniciar sesión como administrador.")
        return
      }

      if (!fakeMatchId.trim()) {
        setError("Tenés que ingresar el ID del partido.")
        return
      }

      const home = Number(fakeHomeScore || "0")
      const away = Number(fakeAwayScore || "0")

      const res = await fetch("/api/admin/matches/fake-stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          matchId: fakeMatchId.trim(),
          homeScore: Number.isFinite(home) ? home : 0,
          awayScore: Number.isFinite(away) ? away : 0,
          clearExisting: fakeClearExisting,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Error al generar estadísticas ficticias")
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

        <Card>
          <CardHeader>
            <CardTitle>Generar estadísticas ficticias para un partido</CardTitle>
            <CardDescription>
              Útil como último recurso cuando se perdió la planilla de un partido. Genera minutos y puntos razonables por
              jugadora a partir de un resultado final. Usar solo en casos excepcionales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="fake-match-id">
                ID del partido (matchId)
              </label>
              <input
                id="fake-match-id"
                className="border rounded px-2 py-1 text-sm w-full"
                value={fakeMatchId}
                onChange={(e) => setFakeMatchId(e.target.value)}
                placeholder="UUID del partido"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="fake-home-score">
                  Puntos local
                </label>
                <input
                  id="fake-home-score"
                  type="number"
                  className="border rounded px-2 py-1 text-sm w-full"
                  value={fakeHomeScore}
                  onChange={(e) => setFakeHomeScore(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="fake-away-score">
                  Puntos visitante
                </label>
                <input
                  id="fake-away-score"
                  type="number"
                  className="border rounded px-2 py-1 text-sm w-full"
                  value={fakeAwayScore}
                  onChange={(e) => setFakeAwayScore(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fakeClearExisting}
                onChange={(e) => setFakeClearExisting(e.target.checked)}
              />
              Borrar estadísticas existentes de este partido antes de generar
            </label>
            <Button variant="destructive" disabled={loading !== "none"} onClick={callFakeStats}>
              {loading === "autofix" ? "Generando..." : "Generar estadísticas ficticias"}
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
