"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, Calendar, Trophy, Users, ArrowLeft } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type Branch = "masculino" | "femenino" | "mixto"

type TournamentRow = {
  id: string
  name: string
  shortName: string
  description?: string | null
  year?: number | null
  branch: Branch
}

type UiTeam = {
  id: string
  name: string
  club?: string | null
  logoUrl?: string
  primaryColor?: string | null
}

type UiMatch = {
  id: string
  round: number
  status: "programado" | "en_juego" | "finalizado"
  scheduledDate?: Date
  scheduledTime?: string | null
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  homeScore?: number | null
  awayScore?: number | null
  liveHomeScore?: number | null
  liveAwayScore?: number | null
  livePeriod?: number | null
  liveGameTime?: number | null
  phase?: string | null
  zoneCode?: string | null
  createdAt?: Date
}

interface ChampionshipPageProps {
  params: Promise<{ id: string }>
}

export default function ChampionshipPage({ params }: ChampionshipPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [championship, setChampionship] = useState<TournamentRow | null>(null)
  const [teams, setTeams] = useState<UiTeam[]>([])
  const [matches, setMatches] = useState<UiMatch[]>([])
  // Placeholder hasta que conectemos una tabla de posiciones real en Supabase
  const [standings] = useState<any[]>([])

  const getLiveStateForMatch = (match: UiMatch) => {
    // 1) Preferir estado vivo centralizado en Supabase
    if (
      typeof match.liveHomeScore === "number" ||
      typeof match.liveAwayScore === "number" ||
      typeof match.livePeriod === "number" ||
      typeof match.liveGameTime === "number"
    ) {
      return {
        homeScore: match.liveHomeScore ?? match.homeScore ?? 0,
        awayScore: match.liveAwayScore ?? match.awayScore ?? 0,
        period: typeof match.livePeriod === "number" ? match.livePeriod : undefined,
        gameTime: typeof match.liveGameTime === "number" ? match.liveGameTime : undefined,
      }
    }

    // 2) Si no hay estado vivo en DB, intentar leer desde localStorage (mismo dispositivo que la mesa)
    if (typeof window !== "undefined") {
      try {
        const key = `planilla-state:${match.id}`
        const raw = window.localStorage.getItem(key)
        if (raw) {
          console.log("[ChampionshipPage] getLiveStateForMatch: local state found", { matchId: match.id, key })
          const data = JSON.parse(raw) as {
            homeScore?: number
            awayScore?: number
            period?: number
            gameTime?: number
          }

          const liveHome = data.homeScore ?? match.homeScore ?? 0
          const liveAway = data.awayScore ?? match.awayScore ?? 0
          const livePeriod = typeof data.period === "number" ? data.period : undefined
          const liveGameTime = typeof data.gameTime === "number" ? data.gameTime : undefined

          return {
            homeScore: liveHome,
            awayScore: liveAway,
            period: livePeriod,
            gameTime: liveGameTime,
          }
        }
      } catch {
        // ignorar errores de parseo
      }
    }

    // 3) Fallback: usar marcador básico de la tabla matches
    return {
      homeScore: match.homeScore ?? 0,
      awayScore: match.awayScore ?? 0,
      period: undefined,
      gameTime: undefined,
    }
  }

  const formatGameClock = (seconds?: number) => {
    if (typeof seconds !== "number") return "--:--"
    const s = Math.max(0, Math.floor(seconds))
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      // Cargar torneo
      const { data: tRow, error: tError } = await supabase
        .from("tournaments")
        .select("id, name, short_name, description, year, branch")
        .eq("id", id)
        .maybeSingle()

      if (tError || !tRow) {
        setError(tError?.message ?? "Campeonato no encontrado")
        setChampionship(null)
        setTeams([])
        setMatches([])
        setLoading(false)
        return
      }

      const baseChamp: TournamentRow = {
        id: tRow.id,
        name: tRow.name,
        shortName: tRow.short_name ?? tRow.name?.slice(0, 3)?.toUpperCase() ?? "T",
        description: tRow.description,
        year: tRow.year ?? null,
        branch: tRow.branch as Branch,
      }

      setChampionship(baseChamp)

      // Cargar partidos del torneo
      const { data: matchRows, error: mError } = await supabase
        .from("matches")
        .select(
          "id, round, status, scheduled_at, home_score, away_score, live_home_score, live_away_score, live_period, live_game_time, home_team_id, away_team_id, phase, zone_code, created_at",
        )
        .eq("tournament_id", id)

      if (mError) {
        console.error("[ChampionshipPage] Error cargando matches", mError)
        setError((prev) => prev ?? mError.message)
        setMatches([])
        setTeams([])
        setLoading(false)
        return
      }

      console.log("[ChampionshipPage] matchRows", matchRows)

      const teamIds = Array.from(
        new Set(
          (matchRows ?? [])
            .flatMap((m: any) => [m.home_team_id, m.away_team_id])
            .filter((id: any) => typeof id === "string" && id.length > 0),
        ),
      ) as string[]

      console.log("[ChampionshipPage] teamIds derivados de matches", teamIds)

      let teamMap: Record<string, UiTeam> = {}
      if (teamIds.length > 0) {
        const { data: teamRows, error: teamError } = await supabase
          .from("teams")
          .select("id, name, logo_url, primary_color")
          .in("id", teamIds)

        if (teamError) {
          console.error("[ChampionshipPage] Error cargando teams", teamError)
          setError((prev) => prev ?? teamError.message)
        } else {
          console.log("[ChampionshipPage] teamRows", teamRows)
          teamMap = Object.fromEntries(
            (teamRows ?? []).map((t: any) => [
              t.id,
              {
                id: t.id,
                name: t.name,
                club: null,
                logoUrl: t.logo_url ?? undefined,
                primaryColor: t.primary_color ?? null,
              } as UiTeam,
            ]),
          )
          setTeams(Object.values(teamMap))
        }
      }

      const uiMatches: UiMatch[] = (matchRows ?? []).map((m: any) => {
        const scheduledAt = m.scheduled_at ? new Date(m.scheduled_at) : undefined
        const homeTeam = teamMap[m.home_team_id]
        const awayTeam = teamMap[m.away_team_id]
        if (!homeTeam || !awayTeam) {
          console.warn("[ChampionshipPage] Faltan equipos en teamMap para el partido", {
            matchId: m.id,
            home_team_id: m.home_team_id,
            away_team_id: m.away_team_id,
            hasHome: !!homeTeam,
            hasAway: !!awayTeam,
          })
        }
        return {
          id: m.id,
          round: m.round ?? 0,
          status: m.status,
          scheduledDate: scheduledAt,
          scheduledTime: scheduledAt
            ? scheduledAt.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null,
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          homeTeamName: teamMap[m.home_team_id]?.name ?? "Local",
          awayTeamName: teamMap[m.away_team_id]?.name ?? "Visitante",
          homeScore: m.home_score ?? null,
          awayScore: m.away_score ?? null,
          liveHomeScore: m.live_home_score ?? null,
          liveAwayScore: m.live_away_score ?? null,
          livePeriod: m.live_period ?? null,
          liveGameTime: m.live_game_time ?? null,
          phase: m.phase ?? null,
          zoneCode: m.zone_code ?? null,
          createdAt: m.created_at ? new Date(m.created_at) : undefined,
        }
      })

      setMatches(uiMatches)
      setLoading(false)
    }

    run()
  }, [id, supabase])

  const finishedMatches = matches.filter((m) => m.status === "finalizado").length
  const liveMatches = matches.filter((m) => m.status === "en_juego").length
  const scheduledMatches = matches.filter((m) => m.status === "programado").length

  // Agrupado de fixture similar al admin: por fase, ronda y zona
  const groupedFixture = useMemo(() => {
    if (!matches.length) return [] as Array<{
      phase: string | null
      round: number
      zoneCode: string | null
      matches: UiMatch[]
    }>

    const acc = new Map<string, { phase: string | null; round: number; zoneCode: string | null; matches: UiMatch[] }>()

    for (const m of matches) {
      const phase = m.phase ?? "fase_regular"
      const round = m.round
      const zoneCode = phase === "fase_regular" ? m.zoneCode ?? null : null
      const key = `${phase}:${zoneCode ?? ""}:${round}`
      const existing = acc.get(key)
      if (existing) existing.matches.push(m)
      else acc.set(key, { phase, round, zoneCode, matches: [m] })
    }

    const list = Array.from(acc.values())

    const phaseOrder: Record<string, number> = {
      fase_regular: 0,
      playoff: 1,
      cuartos: 2,
      semifinal: 3,
      final: 4,
    }

    list.sort((a, b) => {
      const pa = phaseOrder[a.phase ?? "fase_regular"] ?? 99
      const pb = phaseOrder[b.phase ?? "fase_regular"] ?? 99
      if (pa !== pb) return pa - pb
      if ((a.phase ?? "fase_regular") === "fase_regular" && (b.phase ?? "fase_regular") === "fase_regular") {
        if (a.round !== b.round) return a.round - b.round
        if ((a.zoneCode ?? "") !== (b.zoneCode ?? "")) return (a.zoneCode ?? "").localeCompare(b.zoneCode ?? "")
        return 0
      }
      return a.round - b.round
    })

    for (const g of list) {
      g.matches.sort((a, b) => {
        const aa = a.scheduledDate?.getTime() ?? 0
        const bb = b.scheduledDate?.getTime() ?? 0
        if (aa !== bb) return aa - bb
        const ac = a.createdAt?.getTime() ?? 0
        const bc = b.createdAt?.getTime() ?? 0
        return ac - bc
      })
    }

    return list
  }, [matches])

  const branchColors = {
    masculino: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    femenino: "bg-pink-500/10 text-pink-600 border-pink-500/20",
    mixto: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  }

  const branchLabels = {
    masculino: "Masculino",
    femenino: "Femenino",
    mixto: "Mixto",
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

      {/* Championship Header */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a campeonatos
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {championship && (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary-foreground/10 text-primary-foreground font-bold text-2xl">
                {championship.shortName}
              </div>
            )}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold">{championship?.name ?? "Cargando torneo..."}</h1>
                {championship && (
                  <Badge variant="outline" className={`${branchColors[championship.branch]} border`}>
                    {branchLabels[championship.branch]}
                  </Badge>
                )}
              </div>
              {championship && (
                <p className="text-primary-foreground/70">
                  {championship.description} {championship.year && `- Temporada ${championship.year}`}
                </p>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
            <div className="bg-primary-foreground/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{teams.length}</div>
              <div className="text-sm text-primary-foreground/70">Equipos</div>
            </div>
            <div className="bg-primary-foreground/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{matches.length}</div>
              <div className="text-sm text-primary-foreground/70">Partidos</div>
            </div>
            <div className="bg-primary-foreground/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{finishedMatches}</div>
              <div className="text-sm text-primary-foreground/70">Jugados</div>
            </div>
            <div className="bg-primary-foreground/10 rounded-lg p-4 text-center">
              {liveMatches > 0 ? (
                <>
                  <div className="text-2xl font-bold text-green-400">{liveMatches}</div>
                  <div className="text-sm text-green-400/90 flex items-center justify-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
                    </span>
                    En vivo
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">{scheduledMatches}</div>
                  <div className="text-sm text-primary-foreground/70">Por jugar</div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tabs: Fechas, En vivo, Tabla, Equipos */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-10 sm:px-6 lg:px-8">
        <Tabs defaultValue="fechas" className="flex flex-col gap-6">
          <TabsList>
            <TabsTrigger value="fechas">Fechas</TabsTrigger>
            <TabsTrigger value="en_vivo">En vivo</TabsTrigger>
            <TabsTrigger value="tabla">Tabla</TabsTrigger>
            <TabsTrigger value="equipos">Equipos</TabsTrigger>
          </TabsList>

          {/* Fechas: lista de partidos agrupados por ronda */}
          <TabsContent value="fechas" className="mt-4">
            <div className="space-y-6">
              {groupedFixture.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No hay partidos cargados todavía para este torneo.
                  </CardContent>
                </Card>
              ) : (
                groupedFixture.map((group) => {
                  const title =
                    (group.phase ?? "fase_regular") === "fase_regular"
                      ? group.zoneCode
                        ? `Fecha ${group.round} - Zona ${group.zoneCode}`
                        : `Fecha ${group.round}`
                      : `Playoffs - Fecha ${group.round}`

                  return (
                    <section key={`${group.phase}:${group.zoneCode ?? ""}:${group.round}`} className="space-y-3">
                      <h2 className="text-lg font-semibold">{title}</h2>
                      <div className="space-y-2">
                        {group.matches.map((m) => (
                          <Link key={m.id} href={`/campeonato/${championship?.id ?? ""}/partido/${m.id}`}>
                            <Card className="overflow-hidden cursor-pointer hover:bg-muted/40 transition-colors">
                              <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex items-center gap-4">
                                  {/* Local */}
                                  <div className="flex items-center gap-3">
                                    {(() => {
                                      const team = teams.find((t) => t.id === m.homeTeamId)
                                      if (team?.logoUrl) {
                                        return (
                                          <div className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                            <img
                                              src={team.logoUrl}
                                              alt={team.name}
                                              className="h-full w-full object-cover"
                                            />
                                          </div>
                                        )
                                      }
                                      const bg = team?.primaryColor ?? "#666"
                                      return (
                                        <div
                                          className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                          style={{ backgroundColor: bg }}
                                        >
                                          {m.homeTeamName.substring(0, 2).toUpperCase()}
                                        </div>
                                      )
                                    })()}
                                    <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">
                                      {m.homeTeamName}
                                    </span>
                                  </div>

                                  {/* Centro: VS cuando está programado, marcador cuando está en juego/finalizado */}
                                  {m.status === "programado" ? (
                                    <div className="flex flex-col items-center gap-0.5 min-w-[70px] text-center">
                                      <p className="text-sm font-semibold">VS</p>
                                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                        No comenzado
                                      </span>
                                    </div>
                                  ) : (
                                    (() => {
                                      const live = getLiveStateForMatch(m)
                                      return (
                                        <div className="flex flex-col items-center gap-0.5 min-w-[70px]">
                                          <p
                                            className={
                                              m.status === "en_juego"
                                                ? "text-lg font-bold text-[var(--color-live)]"
                                                : "text-lg font-bold"
                                            }
                                          >
                                            {live.homeScore} - {live.awayScore}
                                          </p>
                                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                            {m.status === "finalizado" ? "Finalizado" : "En juego"}
                                          </span>
                                        </div>
                                      )
                                    })()
                                  )}

                                  {/* Visitante */}
                                  <div className="flex items-center gap-3 ml-auto">
                                    <span className="font-medium truncate text-right max-w-[120px] sm:max-w-[180px]">
                                      {m.awayTeamName}
                                    </span>
                                    {(() => {
                                      const team = teams.find((t) => t.id === m.awayTeamId)
                                      if (team?.logoUrl) {
                                        return (
                                          <div className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                            <img
                                              src={team.logoUrl}
                                              alt={team.name}
                                              className="h-full w-full object-cover"
                                            />
                                          </div>
                                        )
                                      }
                                      const bg = team?.primaryColor ?? "#666"
                                      return (
                                        <div
                                          className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                          style={{ backgroundColor: bg }}
                                        >
                                          {m.awayTeamName.substring(0, 2).toUpperCase()}
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </div>

                                <div className="flex items-center gap-4">
                                  <div className="text-right text-xs text-muted-foreground">
                                    {m.scheduledDate ? (
                                      <>
                                        <p>{m.scheduledDate.toLocaleDateString("es-AR")}</p>
                                        {m.scheduledTime && <p>{m.scheduledTime}</p>}
                                      </>
                                    ) : (
                                      <p>Sin programar</p>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </section>
                  )
                })
              )}
            </div>
          </TabsContent>

          {/* En vivo: partidos en juego */}
          <TabsContent value="en_vivo" className="mt-4">
            {liveMatches === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No hay partidos en vivo en este momento.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {matches
                  .filter((m) => m.status === "en_juego")
                  .map((m) => (
                    <Link key={m.id} href={`/campeonato/${championship?.id ?? ""}/partido/${m.id}`}>
                      <Card className="border-[var(--color-live)]/30 cursor-pointer hover:bg-muted/40 transition-colors">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm font-semibold">
                              {m.homeTeamName} vs {m.awayTeamName}
                            </CardTitle>
                            <CardDescription>
                              {m.scheduledDate
                                ? `${m.scheduledDate.toLocaleDateString("es-AR")}${m.scheduledTime ? ` · ${m.scheduledTime}` : ""}`
                                : "Sin programar"}
                            </CardDescription>
                          </div>
                          <Badge className="bg-[var(--color-live)] text-white">En juego</Badge>
                        </CardHeader>
                        <CardContent className="pt-0 flex items-center justify-between gap-4">
                          {/* Local */}
                          <div className="flex items-center gap-3">
                            {(() => {
                              const team = teams.find((t) => t.id === m.homeTeamId)
                              if (team?.logoUrl) {
                                return (
                                  <div className="h-9 w-9 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                    <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
                                  </div>
                                )
                              }
                              const bg = team?.primaryColor ?? "#666"
                              return (
                                <div
                                  className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                  style={{ backgroundColor: bg }}
                                >
                                  {m.homeTeamName.substring(0, 2).toUpperCase()}
                                </div>
                              )
                            })()}
                            <span className="font-medium truncate max-w-[120px] sm:max-w-[160px]">
                              {m.homeTeamName}
                            </span>
                          </div>

                          {/* Centro: marcador + info de período/tiempo */}
                          {(() => {
                            const live = getLiveStateForMatch(m)
                            return (
                              <div className="flex flex-col items-center gap-0.5 min-w-[90px]">
                                <div className="text-2xl font-bold">
                                  {live.homeScore} - {live.awayScore}
                                </div>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">
                                  {typeof live.period === "number" ? `Cuarto ${live.period}` : "Tiempo de juego"}
                                  {" · "}
                                  {formatGameClock(live.gameTime)}
                                </span>
                              </div>
                            )
                          })()}

                          {/* Visitante */}
                          <div className="flex items-center gap-3 ml-auto">
                            <span className="font-medium truncate text-right max-w-[120px] sm:max-w-[160px]">
                              {m.awayTeamName}
                            </span>
                            {(() => {
                              const team = teams.find((t) => t.id === m.awayTeamId)
                              if (team?.logoUrl) {
                                return (
                                  <div className="h-8 w-8 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                    <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
                                  </div>
                                )
                              }
                              const bg = team?.primaryColor ?? "#666"
                              return (
                                <div
                                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                  style={{ backgroundColor: bg }}
                                >
                                  {m.awayTeamName.substring(0, 2).toUpperCase()}
                                </div>
                              )
                            })()}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
              </div>
            )}
          </TabsContent>

          {/* Equipos: listado simple por ahora */}
          <TabsContent value="equipos" className="mt-4">
            {teams.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No hay equipos cargados para este torneo.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((team) => (
                  <Card key={team.id} className="h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{team.name}</CardTitle>
                      <CardDescription>{team.club}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Estadísticas detalladas por jugador se implementarán a continuación.
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
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
