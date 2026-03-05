"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, ArrowLeft, Trophy } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface PosicionesPageProps {
  params: Promise<{ id: string }>
}

type Tournament = {
  id: string
  name: string
  categoryId?: string | null
}

type Team = {
  id: string
  name: string
  primaryColor: string
  clubName?: string | null
  logoUrl?: string | null
}

type MatchRow = {
  id: string
  homeTeamId: string
  awayTeamId: string
  phase: string
  status: "programado" | "en_juego" | "finalizado"
  homeScore?: number
  awayScore?: number
  liveHomeScore?: number | null
  liveAwayScore?: number | null
  statusReason?: string | null
}

type StandingRow = {
  teamId: string
  played: number
  won: number
  lost: number
  pointsFor: number
  pointsAgainst: number
  points: number
  np: number
}

function computeStandings(teams: Team[], matches: MatchRow[]): StandingRow[] {
  const rows = new Map<string, StandingRow>()

  for (const team of teams) {
    rows.set(team.id, {
      teamId: team.id,
      played: 0,
      won: 0,
      lost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      points: 0,
      np: 0,
    })
  }

  for (const m of matches) {
    if (m.phase !== "fase_regular") continue
    if (m.status !== "finalizado") continue

    const home = rows.get(m.homeTeamId)
    const away = rows.get(m.awayTeamId)
    if (!home || !away) continue

    const homeScore = m.homeScore ?? 0
    const awayScore = m.awayScore ?? 0

    home.played += 1
    away.played += 1

    home.pointsFor += homeScore
    home.pointsAgainst += awayScore

    away.pointsFor += awayScore
    away.pointsAgainst += homeScore

    const reason = (m.statusReason ?? "").toString()
    const isNoShow = reason.startsWith("no_presentacion:")
    const absent = isNoShow ? (reason.split(":")[1] as "home" | "away" | undefined) : undefined

    const homeAbsent = isNoShow && absent === "home"
    const awayAbsent = isNoShow && absent === "away"

    if (homeScore > awayScore) {
      home.won += 1
      home.points += 2
      if (awayAbsent) {
        away.np += 1
        // sin puntos para el ausente
      } else {
        away.lost += 1
        away.points += 1
      }
    } else if (awayScore > homeScore) {
      away.won += 1
      away.points += 2
      if (homeAbsent) {
        home.np += 1
      } else {
        home.lost += 1
        home.points += 1
      }
    }
  }

  const list = Array.from(rows.values())

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (a.np !== b.np) return a.np - b.np
    const aDiff = a.pointsFor - a.pointsAgainst
    const bDiff = b.pointsFor - b.pointsAgainst
    if (bDiff !== aDiff) return bDiff - aDiff
    return b.pointsFor - a.pointsFor
  })

  return list
}

function computeProjectedStandings(teams: Team[], matches: MatchRow[]): StandingRow[] {
  const base = computeStandings(teams, matches)
  const rows = new Map<string, StandingRow>()
  for (const r of base) {
    rows.set(r.teamId, { ...r })
  }

  for (const m of matches) {
    if (m.phase !== "fase_regular") continue
    if (m.status !== "en_juego") continue
    const home = rows.get(m.homeTeamId)
    const away = rows.get(m.awayTeamId)
    if (!home || !away) continue

    const homeScore =
      typeof m.liveHomeScore === "number" && m.liveHomeScore >= 0 ? m.liveHomeScore : m.homeScore ?? 0
    const awayScore =
      typeof m.liveAwayScore === "number" && m.liveAwayScore >= 0 ? m.liveAwayScore : m.awayScore ?? 0

    home.played += 1
    away.played += 1

    home.pointsFor += homeScore
    home.pointsAgainst += awayScore

    away.pointsFor += awayScore
    away.pointsAgainst += homeScore

    if (homeScore > awayScore) {
      home.won += 1
      away.lost += 1
    } else if (awayScore > homeScore) {
      away.won += 1
      home.lost += 1
    }
  }

  const list = Array.from(rows.values())

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (a.np !== b.np) return a.np - b.np
    const aDiff = a.pointsFor - a.pointsAgainst
    const bDiff = b.pointsFor - b.pointsAgainst
    if (bDiff !== aDiff) return bDiff - aDiff
    return b.pointsFor - a.pointsFor
  })

  return list
}

export default function PosicionesPage({ params }: PosicionesPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data: tRow, error: tError } = await supabase
        .from("tournaments")
        .select("id, name, category_id")
        .eq("id", id)
        .maybeSingle()

      if (tError || !tRow) {
        setTournament(null)
        setTeams([])
        setMatches([])
        setError(tError?.message ?? "Campeonato no encontrado")
        setLoading(false)
        return
      }

      const rawTournament = tRow as any
      const tournament: Tournament = {
        id: rawTournament.id as string,
        name: rawTournament.name as string,
        categoryId: (rawTournament.category_id as string | null) ?? null,
      }
      setTournament(tournament)

      const { data: matchRows, error: matchError } = await supabase
        .from("matches")
        .select(
          "id, home_team_id, away_team_id, phase, status, home_score, away_score, live_home_score, live_away_score, status_reason",
        )
        .eq("tournament_id", id)

      if (matchError) {
        setError(matchError.message)
        setMatches([])
        setTeams([])
        setLoading(false)
        return
      }

      const mappedMatches: MatchRow[] = (matchRows ?? []).map((m: any) => ({
        id: m.id as string,
        homeTeamId: m.home_team_id as string,
        awayTeamId: m.away_team_id as string,
        phase: (m.phase as string) ?? "fase_regular",
        status: (m.status as MatchRow["status"]) ?? "programado",
        homeScore: m.home_score ?? undefined,
        awayScore: m.away_score ?? undefined,
        liveHomeScore: (m.live_home_score as number | null) ?? null,
        liveAwayScore: (m.live_away_score as number | null) ?? null,
        statusReason: (m.status_reason as string | null) ?? null,
      }))

      setMatches(mappedMatches)

      // Derivar equipos directamente desde los partidos del torneo
      const teamIds = Array.from(
        new Set((matchRows ?? []).flatMap((m: any) => [m.home_team_id, m.away_team_id]).filter(Boolean)),
      ) as string[]

      if (teamIds.length > 0) {
        const { data: teamRows, error: teamsError } = await supabase
          .from("teams")
          .select("id, name, primary_color, logo_url")
          .in("id", teamIds)
          .order("name", { ascending: true })

        if (teamsError) {
          setError((prev) => prev ?? teamsError.message)
          setTeams([])
        } else {
          setTeams(
            (teamRows ?? []).map((t: any) => ({
              id: t.id as string,
              name: t.name as string,
              primaryColor: (t.primary_color as string | null) ?? "#6b7280",
              clubName: null,
              logoUrl: (t.logo_url as string | null) ?? null,
            })),
          )
        }
      } else {
        setTeams([])
      }

      setLoading(false)
    }

    run()
  }, [id, supabase])

  // Refresco periódico de partidos para actualizar la tabla en vivo
  useEffect(() => {
    if (!tournament) return

    const interval = setInterval(async () => {
      const { data: matchRows, error: matchError } = await supabase
        .from("matches")
        .select(
          "id, home_team_id, away_team_id, phase, status, home_score, away_score, live_home_score, live_away_score, status_reason",
        )
        .eq("tournament_id", tournament.id)

      if (!matchError) {
        setMatches(
          (matchRows ?? []).map((m: any) => ({
            id: m.id as string,
            homeTeamId: m.home_team_id as string,
            awayTeamId: m.away_team_id as string,
            phase: (m.phase as string) ?? "fase_regular",
            status: (m.status as MatchRow["status"]) ?? "programado",
            homeScore: m.home_score ?? undefined,
            awayScore: m.away_score ?? undefined,
            liveHomeScore: (m.live_home_score as number | null) ?? null,
            liveAwayScore: (m.live_away_score as number | null) ?? null,
            statusReason: (m.status_reason as string | null) ?? null,
          })),
        )
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [supabase, tournament])

  const standingsOfficial = useMemo(() => {
    if (!teams.length) return []
    return computeStandings(teams, matches)
  }, [teams, matches])

  const standingsProjected = useMemo(() => {
    if (!teams.length) return []
    return computeProjectedStandings(teams, matches)
  }, [teams, matches])

  const liveMatchesByTeam = useMemo(() => {
    const map = new Map<string, MatchRow[]>()
    for (const m of matches) {
      if (m.phase !== "fase_regular") continue
      if (m.status !== "en_juego") continue
      const ids = [m.homeTeamId, m.awayTeamId]
      for (const id of ids) {
        const list = map.get(id) ?? []
        list.push(m)
        map.set(id, list)
      }
    }
    return map
  }, [matches])

  const getTeamById = (teamId: string) => teams.find((t) => t.id === teamId)

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
            Volver al campeonato
          </Button>
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Tabla de Posiciones</h1>
              <p className="text-primary-foreground/70">{tournament?.name ?? ""}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Standings Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <Card className="p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">Cargando posiciones...</h3>
          </Card>
        ) : error || !tournament ? (
          <Card className="p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No se pudieron cargar las posiciones</h3>
            <p className="text-muted-foreground mt-1">{error ?? "Intenta nuevamente más tarde."}</p>
          </Card>
        ) : standingsProjected.length === 0 ? (
          <Card className="p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No hay posiciones disponibles</h3>
            <p className="text-muted-foreground mt-1">Las posiciones aparecerán cuando se registren partidos.</p>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Clasificación General</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Equipo</TableHead>
                      <TableHead className="text-center w-14">PJ</TableHead>
                      <TableHead className="text-center w-14">G</TableHead>
                      <TableHead className="text-center w-14">P</TableHead>
                      <TableHead className="text-center w-14">NP</TableHead>
                      <TableHead className="text-center w-16">PF</TableHead>
                      <TableHead className="text-center w-16">PC</TableHead>
                      <TableHead className="text-center w-16">DIF</TableHead>
                      <TableHead className="text-center w-14">PTS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {standingsProjected.map((standing, index) => {
                      const team = getTeamById(standing.teamId)
                      const diff = standing.pointsFor - standing.pointsAgainst
                      const isPlayoffPosition = index < 4

                      const live = liveMatchesByTeam.get(standing.teamId)?.[0]
                      const isLive = !!live
                      const liveHome =
                        typeof live?.liveHomeScore === "number" && live.liveHomeScore >= 0
                          ? live.liveHomeScore
                          : live?.homeScore ?? null
                      const liveAway =
                        typeof live?.liveAwayScore === "number" && live.liveAwayScore >= 0
                          ? live.liveAwayScore
                          : live?.awayScore ?? null

                      return (
                        <TableRow key={standing.teamId}>
                          <TableCell className="text-center font-bold">
                            <span className="text-muted-foreground">{index + 1}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {team?.logoUrl ? (
                                <div className="h-8 w-8 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                  <img
                                    src={team.logoUrl}
                                    alt={team.name}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div
                                  className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                                  style={{ backgroundColor: team?.primaryColor || "#6b7280" }}
                                >
                                  {team?.name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{team?.name || "Equipo"}</p>
                                  {standing.np > 0 && (
                                    <Badge variant="destructive" className="h-5 px-2 text-[10px]">
                                      NP
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{team?.clubName}</p>
                                {isLive && live && liveHome != null && liveAway != null && (
                                  <p className="text-[11px] text-[var(--color-success)] font-medium">
                                    En juego: {getTeamById(live.homeTeamId)?.name} {liveHome} - {liveAway}{" "}
                                    {getTeamById(live.awayTeamId)?.name}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{standing.played}</TableCell>
                          <TableCell className="text-center">{standing.won}</TableCell>
                          <TableCell className="text-center">{standing.lost}</TableCell>
                          <TableCell className="text-center">{standing.np}</TableCell>
                          <TableCell className="text-center">{standing.pointsFor}</TableCell>
                          <TableCell className="text-center">{standing.pointsAgainst}</TableCell>
                          <TableCell className="text-center">
                            <span className={diff >= 0 ? "text-green-600" : "text-red-600"}>
                              {diff >= 0 ? "+" : ""}
                              {diff}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-bold">{standing.points}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-500/20 border border-green-500/30"></div>
            <span>Zona de Playoffs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">PJ</span> Partidos Jugados
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">G</span> Ganados
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">P</span> Perdidos
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">PF</span> Puntos a Favor
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">PC</span> Puntos en Contra
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">DIF</span> Diferencia
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">PTS</span> Puntos
          </div>
        </div>
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
