"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, ArrowLeft, Calendar, MapPin, Clock } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface FixturePageProps {
  params: Promise<{ id: string }>
}

type UiTeam = {
  id: string
  name: string
  logoUrl?: string | null
  primaryColor?: string | null
}

type UiMatch = {
  id: string
  round: number
  status: "programado" | "en_juego" | "finalizado"
  scheduledAt?: Date | null
  homeTeamId: string
  awayTeamId: string
  homeScore: number | null
  awayScore: number | null
  phase?: string | null
  zoneCode?: string | null
  venueId?: string | null
}

export default function FixturePage({ params }: FixturePageProps) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [championship, setChampionship] = useState<{ id: string; name: string } | null>(null)
  const [matches, setMatches] = useState<UiMatch[]>([])
  const [teamsById, setTeamsById] = useState<Record<string, UiTeam>>({})

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data: tRow, error: tErr } = (await supabase
        .from("tournaments")
        .select("id, name")
        .eq("id", id)
        .maybeSingle()) as any

      if (tErr || !tRow) {
        setChampionship(null)
        setMatches([])
        setTeamsById({})
        setError(tErr?.message ?? "Campeonato no encontrado")
        setLoading(false)
        return
      }

      setChampionship({ id: (tRow as any).id, name: (tRow as any).name })

      const { data: matchRowsRaw, error: mErr } = (await supabase
        .from("matches")
        .select(
          "id, round, status, scheduled_at, home_score, away_score, home_team_id, away_team_id, phase, zone_code, venue_id",
        )
        .eq("tournament_id", id)) as any

      if (mErr) {
        setMatches([])
        setTeamsById({})
        setError(mErr.message)
        setLoading(false)
        return
      }

      let matchRows = (matchRowsRaw ?? []) as any[]

      const finalizedIds = matchRows.filter((m) => m?.status === "finalizado" && m?.id).map((m) => String(m.id))
      if (finalizedIds.length > 0) {
        const { data: statsRows, error: statsErr } = await supabase
          .from("match_player_stats_planilla")
          .select("match_id, team_id, points")
          .in("match_id", finalizedIds)

        if (!statsErr && Array.isArray(statsRows)) {
          const totalsByMatch: Record<string, Record<string, number>> = {}
          for (const row of statsRows as any[]) {
            const matchId = String(row.match_id)
            const teamId = String(row.team_id)
            const pts = typeof row.points === "number" ? row.points : 0
            if (!totalsByMatch[matchId]) totalsByMatch[matchId] = {}
            totalsByMatch[matchId][teamId] = (totalsByMatch[matchId][teamId] ?? 0) + pts
          }

          matchRows = matchRows.map((m) => {
            if (m.status !== "finalizado") return m
            const totals = totalsByMatch[String(m.id)]
            if (!totals) return m
            const homePts = totals[String(m.home_team_id)]
            const awayPts = totals[String(m.away_team_id)]
            if (typeof homePts !== "number" && typeof awayPts !== "number") return m
            return {
              ...m,
              home_score: typeof homePts === "number" ? homePts : m.home_score,
              away_score: typeof awayPts === "number" ? awayPts : m.away_score,
            }
          })
        }
      }

      const uiMatches: UiMatch[] = matchRows.map((m) => ({
        id: String(m.id),
        round: typeof m.round === "number" ? m.round : 0,
        status: m.status,
        scheduledAt: m.scheduled_at ? new Date(m.scheduled_at) : null,
        homeTeamId: String(m.home_team_id),
        awayTeamId: String(m.away_team_id),
        homeScore: typeof m.home_score === "number" ? m.home_score : null,
        awayScore: typeof m.away_score === "number" ? m.away_score : null,
        phase: m.phase ?? null,
        zoneCode: m.zone_code ?? null,
        venueId: m.venue_id ?? null,
      }))

      setMatches(uiMatches)

      const teamIds = Array.from(
        new Set(uiMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter((x) => typeof x === "string" && x)),
      ) as string[]

      if (teamIds.length > 0) {
        const { data: teamRows, error: teamErr } = await supabase
          .from("teams")
          .select("id, name, logo_url, primary_color")
          .in("id", teamIds)

        if (!teamErr && Array.isArray(teamRows)) {
          const map: Record<string, UiTeam> = {}
          for (const t of teamRows as any[]) {
            map[String(t.id)] = {
              id: String(t.id),
              name: String(t.name ?? ""),
              logoUrl: t.logo_url ?? null,
              primaryColor: t.primary_color ?? null,
            }
          }
          setTeamsById(map)
        }
      }

      setLoading(false)
    }

    void run()
  }, [id, supabase])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold">Cargando...</h2>
        </Card>
      </div>
    )
  }

  if (!championship) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold">Campeonato no encontrado</h2>
          {error && <p className="mt-2 text-sm text-muted-foreground">{error}</p>}
          <Button className="mt-4" onClick={() => router.push("/")}>
            Volver al inicio
          </Button>
        </Card>
      </div>
    )
  }

  // Group matches by round
  const matchesByRound = matches.reduce(
    (acc, match) => {
      if (!acc[match.round]) {
        acc[match.round] = []
      }
      acc[match.round].push(match)
      return acc
    },
    {} as Record<number, UiMatch[]>,
  )

  const rounds = Object.keys(matchesByRound)
    .map(Number)
    .sort((a, b) => a - b)

  const getByeTeamIdForRound = (round: number) => {
    const teamIds = Array.from(
      new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter((x) => typeof x === "string" && x)),
    ) as string[]
    if (teamIds.length % 2 === 0) return null
    const roundMatches = matchesByRound[round] ?? []
    const used = new Set<string>()
    for (const match of roundMatches) {
      used.add(match.homeTeamId)
      used.add(match.awayTeamId)
    }
    return teamIds.find((id) => !used.has(id)) ?? null
  }

  const statusConfig = {
    finalizado: { label: "Finalizado", className: "bg-muted text-muted-foreground" },
    en_juego: { label: "En vivo", className: "bg-green-500 text-white animate-pulse" },
    programado: { label: "Programado", className: "bg-blue-500/10 text-blue-600" },
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-xl tracking-tight">LaBaS</span>
                <p className="text-xs text-muted-foreground hidden sm:block">Liga Amateur de Basquet Salteño</p>
              </div>
            </Link>
          </div>
        </div>
      </header>

      {/* Page Header */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => router.push(`/campeonato/${id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a {championship.name}
          </Button>
          <div className="flex items-center gap-3">
            <Calendar className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Fixture</h1>
              <p className="text-primary-foreground/70">{championship.name}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Fixture Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        {rounds.length === 0 ? (
          <Card className="p-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No hay partidos programados</h3>
            <p className="text-muted-foreground mt-1">Los partidos aparecerán aquí cuando se genere el fixture.</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {rounds.map((round) => (
              <div key={round}>
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant="outline" className="text-base px-3 py-1">
                    Fecha {round}
                  </Badge>
                </div>

                <div className="grid gap-3">
                  {matchesByRound[round].map((match) => {
                    const homeTeam = teamsById[match.homeTeamId]
                    const awayTeam = teamsById[match.awayTeamId]
                    const status = statusConfig[match.status]

                    return (
                      <Card key={match.id} className="overflow-hidden">
                        <CardContent className="p-0">
                          <div className="flex flex-col sm:flex-row">
                            {/* Teams and Score */}
                            <div className="flex-1 p-4">
                              <div className="flex items-center justify-between">
                                {/* Home Team */}
                                <div className="flex items-center gap-3 flex-1">
                                  <div
                                    className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                    style={{ backgroundColor: homeTeam?.primaryColor || "#6b7280" }}
                                  >
                                    {homeTeam?.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold truncate">{homeTeam?.name || "Local"}</p>
                                    <p className="text-xs text-muted-foreground"></p>
                                  </div>
                                </div>

                                {/* Score */}
                                <div className="flex items-center gap-2 px-4">
                                  {match.status === "finalizado" || match.status === "en_juego" ? (
                                    <div className="flex items-center gap-2 text-2xl font-bold tabular-nums">
                                      <span className={match.homeScore! > match.awayScore! ? "text-primary" : ""}>
                                        {match.homeScore}
                                      </span>
                                      <span className="text-muted-foreground">-</span>
                                      <span className={match.awayScore! > match.homeScore! ? "text-primary" : ""}>
                                        {match.awayScore}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">vs</span>
                                  )}
                                </div>

                                {/* Away Team */}
                                <div className="flex items-center gap-3 flex-1 justify-end text-right">
                                  <div className="min-w-0">
                                    <p className="font-semibold truncate">{awayTeam?.name || "Visitante"}</p>
                                    <p className="text-xs text-muted-foreground"></p>
                                  </div>
                                  <div
                                    className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                    style={{ backgroundColor: awayTeam?.primaryColor || "#6b7280" }}
                                  >
                                    {awayTeam?.name.substring(0, 2).toUpperCase()}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Match Info */}
                            <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l bg-muted/30 px-4 py-3 sm:py-0 sm:w-64">
                              <div className="flex-1 space-y-1 text-sm">
                                {match.scheduledAt && (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>
                                      {new Date(match.scheduledAt).toLocaleDateString("es-AR", {
                                        weekday: "short",
                                        day: "numeric",
                                        month: "short",
                                      })}
                                    </span>
                                  </div>
                                )}
                                {match.scheduledAt && (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>
                                      {new Date(match.scheduledAt).toLocaleTimeString("es-AR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })} hs
                                    </span>
                                  </div>
                                )}
                                {match.zoneCode && (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span className="truncate">Zona {match.zoneCode}</span>
                                  </div>
                                )}
                              </div>
                              <Badge className={status.className}>{status.label}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}

                  {(() => {
                    const byeTeamId = getByeTeamIdForRound(round)
                    if (!byeTeamId) return null
                    const byeTeam = teamsById[byeTeamId]
                    return (
                      <Card className="overflow-hidden" key={`bye-${round}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                                style={{ backgroundColor: byeTeam?.primaryColor || "#6b7280" }}
                              >
                                {byeTeam?.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{byeTeam?.name || "Por definir"}</p>
                                <p className="text-sm text-muted-foreground">Libre</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="font-semibold">LaBaS</span>
            </div>
            <p className="text-sm text-muted-foreground">Liga Amateur de Basquet Salteño</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
