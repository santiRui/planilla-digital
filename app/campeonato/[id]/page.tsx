"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
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
  const [teamStats, setTeamStats] = useState<
    Array<{
      matchId: string
      teamId: string
      playerId: string
      minutes: number
      points: number
      t1Made: number
      t1Att: number
      t2Made: number
      t2Att: number
      t3Made: number
      t3Att: number
      rebounds: number
      assists: number
      steals: number
      turnovers: number
      blocksCommitted: number
      blocksReceived: number
      foulsCommitted: number
      foulsReceived: number
    }>
  >([])
  const [players, setPlayers] = useState<Array<{ id: string; name: string; number: number | null }>>([])
  // Pestaña activa en los Tabs (fechas, en_vivo, tabla, equipos)
  const [activeTab, setActiveTab] = useState<"fechas" | "en_vivo" | "tabla" | "equipos">("fechas")
  // Filtro de fase para el fixture (fase_regular, cuartos, semifinal, final)
  const [phaseFilter, setPhaseFilter] = useState<"fase_regular" | "cuartos" | "semifinal" | "final">("fase_regular")
  // Estado colapsado/expandido por grupo de fecha
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const getLiveStateForMatch = (match: UiMatch) => {
    // Si el partido ya está finalizado, usamos siempre el resultado oficial de matches
    if (match.status === "finalizado") {
      return {
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        period: undefined,
        gameTime: undefined,
      }
    }

    // 1) Para partidos no finalizados, preferir estado vivo centralizado en Supabase
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

      // 3) Cargar estadísticas iniciales de jugadores para todos los partidos finalizados del torneo
      const finalizedMatchIds = (matchRows ?? [])
        .filter((m: any) => m.status === "finalizado")
        .map((m: any) => m.id as string)

      if (finalizedMatchIds.length > 0) {
        await loadTeamStatsForMatches(finalizedMatchIds)
      }
      setLoading(false)

      // Suscripción en tiempo real a cambios de partidos de este torneo
      if ((matchRows ?? []).length > 0) {
        const channel = supabase
          .channel("championship-matches-live")
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "matches",
              filter: `tournament_id=eq.${id}`,
            },
            (payload) => {
              const updated = payload.new as any
              const matchId = updated.id as string | undefined
              if (!matchId) return

              setMatches((current) => {
                const exists = current.some((m) => m.id === matchId)
                if (!exists) return current

                return current.map((m) => {
                  if (m.id !== matchId) return m

                  return {
                    ...m,
                    status: (updated.status as UiMatch["status"]) ?? m.status,
                    homeScore: updated.home_score ?? m.homeScore ?? null,
                    awayScore: updated.away_score ?? m.awayScore ?? null,
                    liveHomeScore: updated.live_home_score ?? null,
                    liveAwayScore: updated.live_away_score ?? null,
                    livePeriod: updated.live_period ?? null,
                    liveGameTime: updated.live_game_time ?? null,
                  }
                })
              })
            },
          )
          .subscribe()

        return () => {
          supabase.removeChannel(channel)
        }
      }

      setLoading(false)
    }

    const cleanupPromise = run()

    return () => {
      cleanupPromise?.then((cleanup) => {
        if (typeof cleanup === "function") cleanup()
      })
    }
  }, [id, supabase])

  const finishedMatches = matches.filter((m) => m.status === "finalizado").length
  const liveMatches = matches.filter((m) => m.status === "en_juego").length
  const scheduledMatches = matches.filter((m) => m.status === "programado").length

  // Cuando el usuario selecciona la pestaña "tabla", redirigir a la página pública de posiciones.
  useEffect(() => {
    if (activeTab !== "tabla") return
    if (typeof window === "undefined") return
    void router.push(`/campeonato/${id}/posiciones`)
  }, [activeTab, id, router])

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
      const key = `${m.phase ?? "fase_regular"}__${m.round ?? 1}__${m.zoneCode ?? ""}`
      const existing = acc.get(key)
      if (existing) existing.matches.push(m)
      else acc.set(key, { phase: m.phase ?? "fase_regular", round: m.round ?? 1, zoneCode: m.zoneCode ?? null, matches: [m] })
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

    // Filtrar por fase seleccionada
    const filtered = Array.from(acc.values()).filter((g) => (g.phase ?? "fase_regular") === phaseFilter)

    return filtered.sort((a, b) => {
      if ((a.round ?? 1) !== (b.round ?? 1)) {
        return (a.round ?? 1) - (b.round ?? 1)
      }
      if ((a.zoneCode ?? "") !== (b.zoneCode ?? "")) return (a.zoneCode ?? "").localeCompare(b.zoneCode ?? "")
      return 0
    })
  }, [matches, phaseFilter])

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

  // Carga/recalcula estadísticas de equipos para una lista de partidos finalizados
  const loadTeamStatsForMatches = useCallback(
    async (matchIds: string[]) => {
      if (!matchIds.length) return

      const { data: statsRows, error: statsError } = await supabase
        .from("match_player_stats")
        .select(
          "match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, turnovers, blocks_committed, blocks_received, fouls_committed, fouls_received",
        )
        .in("match_id", matchIds)

      if (statsError || !statsRows) return

      const mappedStats = (statsRows as any[]).map((r) => ({
        matchId: r.match_id as string,
        teamId: r.team_id as string,
        playerId: r.player_id as string,
        minutes: Number(r.minutes) || 0,
        points: r.points ?? 0,
        t1Made: r.t1_made ?? 0,
        t1Att: r.t1_att ?? 0,
        t2Made: r.t2_made ?? 0,
        t2Att: r.t2_att ?? 0,
        t3Made: r.t3_made ?? 0,
        t3Att: r.t3_att ?? 0,
        rebounds: r.rebounds ?? 0,
        assists: r.assists ?? 0,
        steals: r.steals ?? 0,
        turnovers: r.turnovers ?? 0,
        blocksCommitted: r.blocks_committed ?? 0,
        blocksReceived: r.blocks_received ?? 0,
        foulsCommitted: r.fouls_committed ?? 0,
        foulsReceived: r.fouls_received ?? 0,
      }))
      setTeamStats(mappedStats)

      const playerIds = Array.from(new Set(mappedStats.map((s) => s.playerId))) as string[]
      if (playerIds.length > 0) {
        const { data: playerRows, error: playersError } = await supabase
          .from("players")
          .select("id, first_name, last_name, shirt_number")
          .in("id", playerIds)

        if (!playersError && playerRows) {
          setPlayers(
            (playerRows as any[]).map((p) => ({
              id: p.id as string,
              name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Jugador",
              number: (p.shirt_number as number | null) ?? null,
            })),
          )
        }
      }
    },
    [supabase],
  )

  // Helpers para stats de equipos
  const teamStatsByTeam = useMemo(() => {
    const map = new Map<string, typeof teamStats>()
    for (const row of teamStats) {
      const list = map.get(row.teamId) ?? []
      list.push(row)
      map.set(row.teamId, list)
    }
    return map
  }, [teamStats])

  const playersById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; number: number | null }>()
    for (const p of players) map.set(p.id, p)
    return map
  }, [players])

  // Refresco en vivo de estadísticas de equipos mientras haya partidos del torneo (para futuras vistas dedicadas)
  useEffect(() => {
    if (matches.length === 0) return

    const finalizedIds = matches.filter((m) => m.status === "finalizado").map((m) => m.id)
    if (finalizedIds.length === 0) return

    void loadTeamStatsForMatches(finalizedIds)

    const idInterval = window.setInterval(() => {
      void loadTeamStatsForMatches(finalizedIds)
    }, 10000)

    return () => window.clearInterval(idInterval)
  }, [matches, loadTeamStatsForMatches])

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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex flex-col gap-6">
          <TabsList>
            <TabsTrigger value="fechas">Fechas</TabsTrigger>
            <TabsTrigger value="en_vivo">En vivo</TabsTrigger>
            <TabsTrigger value="tabla">Tabla</TabsTrigger>
            <TabsTrigger value="equipos">Equipos</TabsTrigger>
          </TabsList>

          {/* Fechas: lista de partidos agrupados por ronda */}
          <TabsContent value="fechas" className="mt-4">
            {/* Filtro de fase */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                size="sm"
                variant={phaseFilter === "fase_regular" ? "default" : "outline"}
                onClick={() => setPhaseFilter("fase_regular")}
              >
                Fase de grupos
              </Button>
              {matches.some((m) => m.phase === "cuartos") && (
                <Button
                  size="sm"
                  variant={phaseFilter === "cuartos" ? "default" : "outline"}
                  onClick={() => setPhaseFilter("cuartos")}
                >
                  Cuartos de final
                </Button>
              )}
              {matches.some((m) => m.phase === "semifinal") && (
                <Button
                  size="sm"
                  variant={phaseFilter === "semifinal" ? "default" : "outline"}
                  onClick={() => setPhaseFilter("semifinal")}
                >
                  Semifinales
                </Button>
              )}
              {matches.some((m) => m.phase === "final") && (
                <Button
                  size="sm"
                  variant={phaseFilter === "final" ? "default" : "outline"}
                  onClick={() => setPhaseFilter("final")}
                >
                  Final
                </Button>
              )}
            </div>

            <div className="space-y-6">
              {groupedFixture.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No hay partidos cargados todavía para este torneo.
                  </CardContent>
                </Card>
              ) : (
                groupedFixture.map((group) => {
                  const groupKey = `${group.phase ?? "fase_regular"}-${group.round}-${group.zoneCode ?? ""}`
                  const collapsed = collapsedGroups[groupKey] ?? false

                  return (
                    <section key={groupKey} className="space-y-3">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between text-left"
                        onClick={() =>
                          setCollapsedGroups((prev) => ({
                            ...prev,
                            [groupKey]: !collapsed,
                          }))
                        }
                      >
                        <h2 className="text-lg font-semibold">
                          Fecha {group.round} {group.zoneCode ? `- Zona ${group.zoneCode}` : ""}
                        </h2>
                        <span className="text-sm text-muted-foreground">{collapsed ? "➤" : "▼"}</span>
                      </button>

                      {!collapsed && (
                        <div className="space-y-3">
                          {group.matches.map((match) => (
                            <Link key={match.id} href={`/campeonato/${championship?.id ?? ""}/partido/${match.id}`}>
                              <Card className="overflow-hidden cursor-pointer hover:bg-muted/40 transition-colors">
                                <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div className="flex items-center gap-4">
                                    {/* Local */}
                                    <div className="flex items-center gap-3">
                                      {(() => {
                                        const team = teams.find((t) => t.id === match.homeTeamId)
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
                                            {match.homeTeamName.substring(0, 2).toUpperCase()}
                                          </div>
                                        )
                                      })()}
                                      <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">
                                        {match.homeTeamName}
                                      </span>
                                    </div>

                                    {/* Centro: VS cuando está programado, marcador cuando está en juego/finalizado */}
                                    {match.status === "programado" ? (
                                      <div className="flex flex-col items-center gap-0.5 min-w-[70px] text-center">
                                        <p className="text-sm font-semibold">VS</p>
                                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                          No comenzado
                                        </span>
                                      </div>
                                    ) : (
                                      (() => {
                                        const live = getLiveStateForMatch(match)
                                        return (
                                          <div className="flex flex-col items-center gap-0.5 min-w-[70px]">
                                            <p
                                              className={
                                                match.status === "en_juego"
                                                  ? "text-lg font-bold text-[var(--color-live)]"
                                                  : "text-lg font-bold"
                                              }
                                            >
                                              {live.homeScore} - {live.awayScore}
                                            </p>
                                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">
                                              {match.status === "finalizado"
                                                ? "Finalizado"
                                                : `${
                                                    typeof live.period === "number"
                                                      ? `Cuarto ${live.period}`
                                                      : "En juego"
                                                  } · ${formatGameClock(live.gameTime)}`}
                                            </span>
                                          </div>
                                        )
                                      })()
                                    )}

                                    {/* Visitante */}
                                    <div className="flex items-center gap-3 ml-auto">
                                      <span className="font-medium truncate text-right max-w-[120px] sm:max-w-[180px]">
                                        {match.awayTeamName}
                                      </span>
                                      {(() => {
                                        const team = teams.find((t) => t.id === match.awayTeamId)
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
                                            {match.awayTeamName.substring(0, 2).toUpperCase()}
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-4">
                                    <div className="text-right text-xs text-muted-foreground">
                                      {match.scheduledDate ? (
                                        <>
                                          <p>{match.scheduledDate.toLocaleDateString("es-AR")}</p>
                                          {match.scheduledTime && <p>{match.scheduledTime}</p>}
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
                      )}
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

          {/* Tabla: muestra placeholder mientras el useEffect redirige a /posiciones */}
          <TabsContent value="tabla" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Cargando tabla de posiciones...
              </CardContent>
            </Card>
          </TabsContent>

          {/* Equipos: tarjetas que llevan a la vista dedicada de estadísticas por equipo */}
          <TabsContent value="equipos" className="mt-4">
            {teams.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No hay equipos cargados para este torneo.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {teams.map((team) => {
                  const rows = teamStatsByTeam.get(team.id) ?? []

                  const totals = rows.reduce(
                    (acc, r) => {
                      acc.points += r.points
                      acc.minutes += r.minutes
                      return acc
                    },
                    { points: 0, minutes: 0 },
                  )

                  const matchIds = Array.from(new Set(rows.map((r) => r.matchId)))
                  const playedMatches = matchIds.length

                  let standingPoints = 0
                  for (const mid of matchIds) {
                    const match = matches.find((m) => m.id === mid)
                    if (!match || match.status !== "finalizado") continue
                    const isHome = match.homeTeamId === team.id
                    const teamScore = isHome ? match.homeScore ?? 0 : match.awayScore ?? 0
                    const oppScore = isHome ? match.awayScore ?? 0 : match.homeScore ?? 0
                    standingPoints += teamScore > oppScore ? 2 : 1
                  }

                  return (
                    <Link key={team.id} href={`/campeonato/${championship?.id ?? ""}/equipo/${team.id}`}>
                      <Card className="overflow-hidden cursor-pointer hover:bg-muted/40 transition-colors">
                        <CardHeader className="pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                          {team.logoUrl ? (
                            <div className="h-9 w-9 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                              <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div
                              className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ backgroundColor: team.primaryColor ?? "#666" }}
                            >
                              {team.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <CardTitle className="text-base">{team.name}</CardTitle>
                            {team.club && <CardDescription>{team.club}</CardDescription>}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                          <div>
                            <div className="font-semibold text-base text-foreground">{playedMatches}</div>
                            <div>PJ</div>
                          </div>
                          <div>
                            <div className="font-semibold text-base text-foreground">{standingPoints}</div>
                            <div>PTS</div>
                          </div>
                          <div>
                            <div className="font-semibold text-base text-foreground">{totals.points}</div>
                            <div>Puntos</div>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                )
              })}
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
