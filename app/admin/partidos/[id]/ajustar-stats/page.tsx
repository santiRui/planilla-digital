"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type UiMatch = {
  id: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  homeScore: number
  awayScore: number
  status: string
}

type UiStatRow = {
  matchId: string
  teamId: string
  playerId: string
  playerName: string
  jerseyNumber: number | null
  minutes: number | null
  points: number | null
  t1Made: number | null
  t1Att: number | null
  t2Made: number | null
  t2Att: number | null
  t3Made: number | null
  t3Att: number | null
}

export default function AdjustMatchStatsPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const matchId = params.id

  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [match, setMatch] = useState<UiMatch | null>(null)
  const [stats, setStats] = useState<UiStatRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token ?? null
      setAccessToken(token)
    })
  }, [])

  useEffect(() => {
    if (!accessToken || !matchId) return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        setMessage(null)

        const res = await fetch(`/api/admin/matches/${matchId}/stats-override`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "No se pudieron cargar las estadísticas")
          return
        }

        setMatch(data.match as UiMatch)
        setStats((data.stats ?? []) as UiStatRow[])
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error desconocido"
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    void fetchData()
  }, [accessToken, matchId])

  const homeStats = useMemo(() => stats.filter((s) => s.teamId === match?.homeTeamId), [stats, match])
  const awayStats = useMemo(() => stats.filter((s) => s.teamId === match?.awayTeamId), [stats, match])

  const homeTotalPoints = useMemo(
    () => homeStats.reduce((acc, s) => acc + (s.points ?? 0), 0),
    [homeStats],
  )
  const awayTotalPoints = useMemo(
    () => awayStats.reduce((acc, s) => acc + (s.points ?? 0), 0),
    [awayStats],
  )

  const handlePointsChange = (playerId: string, value: string) => {
    const parsed = value === "" ? null : Number(value)
    if (parsed !== null && !Number.isFinite(parsed)) return

    setStats((prev) =>
      prev.map((s) => (s.playerId === playerId ? { ...s, points: parsed } : s)),
    )
  }

  const handleSave = async () => {
    if (!accessToken || !matchId) return

    try {
      setSaving(true)
      setError(null)
      setMessage(null)

      const res = await fetch(`/api/admin/matches/${matchId}/stats-override`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ stats }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "No se pudieron guardar los cambios")
        return
      }

      setMessage("Ajustes guardados correctamente.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!match) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Ajustar estadísticas del partido</h1>
            <Button variant="outline" onClick={() => router.back()}>
              Volver
            </Button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : <p>Cargando...</p>}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ajustar estadísticas del partido</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Resultado oficial: <strong>{match.homeTeamName}</strong> {match.homeScore} – {match.awayScore} <strong>{match.awayTeamName}</strong>
            </p>
          </div>
          <Button variant="outline" onClick={() => router.back()}>
            Volver
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{match.homeTeamName} – Estadísticas</CardTitle>
            <CardDescription>
              Total stats: {homeTotalPoints} puntos · Marcador oficial: {match.homeScore} puntos.
              Ajustá los puntos por jugadora hasta que coincidan.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Jugador</th>
                  <th className="px-2 py-1 text-right">Min</th>
                  <th className="px-2 py-1 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {homeStats.map((s) => (
                  <tr key={s.playerId} className="border-b last:border-0">
                    <td className="px-2 py-1 text-left whitespace-nowrap">
                      {s.jerseyNumber ?? ""}
                    </td>
                    <td className="px-2 py-1 text-left whitespace-nowrap">{s.playerName}</td>
                    <td className="px-2 py-1 text-right">
                      {s.minutes != null ? s.minutes.toFixed(2) : ""}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Input
                        className="h-7 w-20 text-right"
                        type="number"
                        value={s.points ?? ""}
                        onChange={(e) => handlePointsChange(s.playerId, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-1" colSpan={3}>
                    Total
                  </td>
                  <td className="px-2 py-1 text-right">{homeTotalPoints}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{match.awayTeamName} – Estadísticas</CardTitle>
            <CardDescription>
              Total stats: {awayTotalPoints} puntos · Marcador oficial: {match.awayScore} puntos.
              Ajustá los puntos por jugadora hasta que coincidan.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Jugador</th>
                  <th className="px-2 py-1 text-right">Min</th>
                  <th className="px-2 py-1 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {awayStats.map((s) => (
                  <tr key={s.playerId} className="border-b last:border-0">
                    <td className="px-2 py-1 text-left whitespace-nowrap">
                      {s.jerseyNumber ?? ""}
                    </td>
                    <td className="px-2 py-1 text-left whitespace-nowrap">{s.playerName}</td>
                    <td className="px-2 py-1 text-right">
                      {s.minutes != null ? s.minutes.toFixed(2) : ""}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Input
                        className="h-7 w-20 text-right"
                        type="number"
                        value={s.points ?? ""}
                        onChange={(e) => handlePointsChange(s.playerId, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-1" colSpan={3}>
                    Total
                  </td>
                  <td className="px-2 py-1 text-right">{awayTotalPoints}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Guardando..." : "Guardar ajustes"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && !error && <p className="text-sm text-emerald-600">{message}</p>}
        </div>
      </div>
    </main>
  )
}
