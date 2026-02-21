"use client"

import { Fragment, use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Activity, ArrowLeft, Clock, Trophy } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface MatchDetailPageProps {
  params: Promise<{ id: string; matchId: string }>
}

type UiMatchDetail = {
  id: string
  tournamentId: string
  round: number
  status: "programado" | "en_juego" | "finalizado"
  scheduledDate?: Date
  scheduledTime?: string | null
  homeTeamId?: string | null
  awayTeamId?: string | null
  homeTeamName: string
  awayTeamName: string
  homeScore: number
  awayScore: number
  liveHomeScore?: number | null
  liveAwayScore?: number | null
  livePeriod?: number | null
  liveGameTime?: number | null
  homeTeamLogoUrl?: string | null
  awayTeamLogoUrl?: string | null
  homeTeamPrimaryColor?: string | null
  awayTeamPrimaryColor?: string | null
}

type UiEvent = {
  id: string
  type: string
  period: number
  gameTime: string
  timestamp: string
  teamId?: string
  teamName?: string
  playerName?: string
  points?: number | null
  shotType?: number | null
  made?: boolean | null
  teamColor?: string | null
  jerseyNumber?: number | null
  foulType?: string | null
  reboundType?: string | null
  victimPlayerName?: string | null
  victimJerseyNumber?: number | null
}

type MatchRow = {
  id: string
  tournament_id: string
  round: number | null
  status: "programado" | "en_juego" | "finalizado"
  scheduled_at: string | null
  home_score: number | null
  away_score: number | null
  home_team_id: string | null
  away_team_id: string | null
  live_home_score: number | null
  live_away_score: number | null
  live_period: number | null
  live_game_time: number | null
}

function formatEventTitle(ev: UiEvent): string {
  switch (ev.type) {
    case "points":
      return ev.points ? `+${ev.points}` : "Puntos"
    case "shot":
      if (ev.shotType === 2) return ev.made ? "Doble anotado" : "Doble fallado"
      if (ev.shotType === 3) return ev.made ? "Triple anotado" : "Triple fallado"
      return ev.made ? "Lanzamiento anotado" : "Lanzamiento fallado"
    case "free_throw":
      return ev.made ? "Libre anotado" : "Libre fallado"
    case "rebound":
      return "Rebote"
    case "assist":
      return "Asistencia"
    case "turnover":
      return "Pérdida"
    case "steal":
      return "Recuperación"
    case "block":
      return "Tapa"
    case "foul":
      return "Falta"
    case "timeout":
      return "Tiempo muerto"
    case "substitution_in":
    case "substitution_out":
      return "Sustitución"
    default:
      return "Acción"
  }
}

export default function MatchDetailPage({ params }: MatchDetailPageProps) {
  const { id: tournamentId, matchId } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [match, setMatch] = useState<UiMatchDetail | null>(null)
  const [events, setEvents] = useState<UiEvent[]>([])

  const getLiveStateForMatch = (m: UiMatchDetail | null) => {
    if (!m) {
      return {
        homeScore: 0,
        awayScore: 0,
        period: undefined as number | undefined,
        gameTime: undefined as number | undefined,
      }
    }

    // Si el partido ya está finalizado, usamos siempre el resultado oficial
    if (m.status === "finalizado") {
      return {
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        period: undefined as number | undefined,
        gameTime: undefined as number | undefined,
      }
    }

    // Para partidos no finalizados, priorizar estado vivo si existe
    if (
      typeof m.liveHomeScore === "number" ||
      typeof m.liveAwayScore === "number" ||
      typeof m.livePeriod === "number" ||
      typeof m.liveGameTime === "number"
    ) {
      return {
        homeScore: m.liveHomeScore ?? m.homeScore ?? 0,
        awayScore: m.liveAwayScore ?? m.awayScore ?? 0,
        period: typeof m.livePeriod === "number" ? m.livePeriod : (undefined as number | undefined),
        gameTime: typeof m.liveGameTime === "number" ? m.liveGameTime : (undefined as number | undefined),
      }
    }

    // Fallback: marcador básico
    return {
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      period: undefined as number | undefined,
      gameTime: undefined as number | undefined,
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

      // Leer datos básicos del partido
      const { data, error: mError } = await supabase
        .from("matches")
        .select(
          "id, tournament_id, round, status, scheduled_at, home_score, away_score, home_team_id, away_team_id, live_home_score, live_away_score, live_period, live_game_time",
        )
        .eq("id", matchId)
        .maybeSingle()

      const mRow = data as MatchRow | null

      if (mError || !mRow) {
        setError(mError?.message ?? "Partido no encontrado")
        setLoading(false)
        return
      }

      const teamIds = [mRow.home_team_id, mRow.away_team_id].filter(Boolean) as string[]
      let homeTeamName = "Local"
      let awayTeamName = "Visitante"
      let homeTeamLogoUrl: string | null = null
      let awayTeamLogoUrl: string | null = null
      let homeTeamPrimaryColor: string | null = null
      let awayTeamPrimaryColor: string | null = null

      if (teamIds.length > 0) {
        const { data: teamRows } = await supabase
          .from("teams")
          .select("id, name, logo_url, primary_color")
          .in("id", teamIds)

        type TeamUiInfo = { name: string; logoUrl: string | null; primaryColor: string | null }

        const teamMap: Record<string, TeamUiInfo> = Object.fromEntries(
          (teamRows ?? []).map((t: any) => [
            t.id,
            {
              name: t.name as string,
              logoUrl: (t.logo_url as string | null) ?? null,
              primaryColor: (t.primary_color as string | null) ?? null,
            },
          ]),
        )

        const homeTeam = teamMap[mRow.home_team_id as string]
        const awayTeam = teamMap[mRow.away_team_id as string]

        if (homeTeam) {
          homeTeamName = homeTeam.name ?? homeTeamName
          homeTeamLogoUrl = homeTeam.logoUrl
          homeTeamPrimaryColor = homeTeam.primaryColor
        }

        if (awayTeam) {
          awayTeamName = awayTeam.name ?? awayTeamName
          awayTeamLogoUrl = awayTeam.logoUrl
          awayTeamPrimaryColor = awayTeam.primaryColor
        }
      }

      const scheduledAt = mRow.scheduled_at ? new Date(mRow.scheduled_at) : undefined

      setMatch({
        id: mRow.id,
        tournamentId: mRow.tournament_id,
        round: mRow.round ?? 0,
        status: mRow.status,
        scheduledDate: scheduledAt,
        scheduledTime: scheduledAt
          ? scheduledAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
          : null,
        homeTeamId: mRow.home_team_id,
        awayTeamId: mRow.away_team_id,
        homeTeamName,
        awayTeamName,
        homeScore: mRow.home_score ?? 0,
        awayScore: mRow.away_score ?? 0,
        liveHomeScore: mRow.live_home_score ?? null,
        liveAwayScore: mRow.live_away_score ?? null,
        livePeriod: mRow.live_period ?? null,
        liveGameTime: mRow.live_game_time ?? null,
        homeTeamLogoUrl,
        awayTeamLogoUrl,
        homeTeamPrimaryColor,
        awayTeamPrimaryColor,
      })

      // Leer eventos del partido
      const { data: evRows, error: evError } = await supabase
        .from("match_events")
        .select(
          "id, team_id, type, period, game_time, occurred_at, points, shot_type, made, team:teams!match_events_team_id_fkey(name, primary_color), player:players!match_events_player_id_fkey(first_name, last_name, jersey_number), victim_player:players!match_events_victim_player_id_fkey(first_name, last_name, jersey_number)",
        )
        .eq("match_id", matchId)
        .order("occurred_at", { ascending: false })

      let uiEvents: UiEvent[] = []

      if (!evError) {
        console.log("[match-events] fetched", {
          matchId,
          count: evRows?.length ?? 0,
          sample: (evRows ?? []).slice(0, 3),
        })

        uiEvents = (evRows ?? []).map((e: any) => ({
        id: e.id,
        type: e.type as string,
        period: e.period,
        gameTime: e.game_time as string,
        timestamp: (e.occurred_at as string) ?? new Date().toISOString(),
        teamId: e.team_id as string | undefined,
        teamName: e.team?.name as string | undefined,
        playerName:
          e.player?.first_name && e.player?.last_name
            ? `${e.player.last_name}, ${e.player.first_name}`
            : undefined,
        points: e.points ?? null,
        shotType: e.shot_type ?? null,
        made: typeof e.made === "boolean" ? e.made : null,
        teamColor: e.team?.primary_color ?? null,
        jerseyNumber: e.player?.jersey_number ?? null,
        victimPlayerName:
          e.victim_player?.first_name && e.victim_player?.last_name
            ? `${e.victim_player.last_name}, ${e.victim_player.first_name}`
            : null,
        victimJerseyNumber: e.victim_player?.jersey_number ?? null,
        }))
      }

      setEvents(uiEvents)
      setLoading(false)
    }

    void run()
  }, [matchId, supabase])

  // Suscripción en tiempo real a los eventos del partido para mantener el historial actualizado
  useEffect(() => {
    if (!matchId) return

    const reloadEvents = async () => {
      const { data: evRows, error: evError } = await supabase
        .from("match_events")
        .select(
          "id, team_id, type, period, game_time, occurred_at, points, shot_type, made, team:teams!match_events_team_id_fkey(name, primary_color), player:players!match_events_player_id_fkey(first_name, last_name, jersey_number), victim_player:players!match_events_victim_player_id_fkey(first_name, last_name, jersey_number)",
        )
        .eq("match_id", matchId)
        .order("occurred_at", { ascending: false })

      if (evError) {
        return
      }

      console.log("[match-events] realtime reload", {
        matchId,
        count: evRows?.length ?? 0,
      })

      const uiEvents: UiEvent[] = (evRows ?? []).map((e: any) => ({
        id: e.id,
        type: e.type as string,
        period: e.period,
        gameTime: e.game_time as string,
        timestamp: (e.occurred_at as string) ?? new Date().toISOString(),
        teamId: e.team_id as string | undefined,
        teamName: e.team?.name as string | undefined,
        playerName:
          e.player?.first_name && e.player?.last_name
            ? `${e.player.last_name}, ${e.player.first_name}`
            : undefined,
        points: e.points ?? null,
        shotType: e.shot_type ?? null,
        made: typeof e.made === "boolean" ? e.made : null,
        teamColor: e.team?.primary_color ?? null,
        jerseyNumber: e.player?.jersey_number ?? null,
        victimPlayerName:
          e.victim_player?.first_name && e.victim_player?.last_name
            ? `${e.victim_player.last_name}, ${e.victim_player.first_name}`
            : null,
        victimJerseyNumber: e.victim_player?.jersey_number ?? null,
      }))

      setEvents(uiEvents)
    }

    const channel = supabase
      .channel(`public:match_events:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_events",
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          void reloadEvents()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [matchId, supabase])

  // Polling periódico para refrescar el historial incluso si falla el realtime
  useEffect(() => {
    if (!matchId) return

    const interval = setInterval(async () => {
      const { data: evRows, error: evError } = await supabase
        .from("match_events")
        .select(
          "id, team_id, type, period, game_time, occurred_at, points, shot_type, made, team:teams!match_events_team_id_fkey(name, primary_color), player:players!match_events_player_id_fkey(first_name, last_name, jersey_number), victim_player:players!match_events_victim_player_id_fkey(first_name, last_name, jersey_number)",
        )
        .eq("match_id", matchId)
        .order("occurred_at", { ascending: false })

      if (evError) {
        return
      }

      const uiEvents: UiEvent[] = (evRows ?? []).map((e: any) => ({
        id: e.id,
        type: e.type as string,
        period: e.period,
        gameTime: e.game_time as string,
        timestamp: (e.occurred_at as string) ?? new Date().toISOString(),
        teamId: e.team_id as string | undefined,
        teamName: e.team?.name as string | undefined,
        playerName:
          e.player?.first_name && e.player?.last_name
            ? `${e.player.last_name}, ${e.player.first_name}`
            : undefined,
        points: e.points ?? null,
        shotType: e.shot_type ?? null,
        made: typeof e.made === "boolean" ? e.made : null,
        teamColor: e.team?.primary_color ?? null,
        jerseyNumber: e.player?.jersey_number ?? null,
        victimPlayerName:
          e.victim_player?.first_name && e.victim_player?.last_name
            ? `${e.victim_player.last_name}, ${e.victim_player.first_name}`
            : null,
        victimJerseyNumber: e.victim_player?.jersey_number ?? null,
      }))

      setEvents(uiEvents)
    }, 8000) // cada 8 segundos

    return () => clearInterval(interval)
  }, [matchId, supabase])

  // Suscripción en tiempo real para mantener marcador y estado vivos actualizados
  useEffect(() => {
    if (!matchId) return

    const channel = supabase
      .channel(`championship-match-detail-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const updated = payload.new as any
          const updatedId = updated.id as string | undefined
          if (!updatedId) return

          setMatch((current) => {
            if (!current || current.id !== updatedId) return current

            return {
              ...current,
              status: (updated.status as UiMatchDetail["status"]) ?? current.status,
              homeScore: updated.home_score ?? current.homeScore,
              awayScore: updated.away_score ?? current.awayScore,
              liveHomeScore: updated.live_home_score ?? null,
              liveAwayScore: updated.live_away_score ?? null,
              livePeriod: updated.live_period ?? null,
              liveGameTime: updated.live_game_time ?? null,
            }
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [matchId, supabase])

  if (!loading && (error || !match)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold">Partido no encontrado</h2>
          <p className="text-muted-foreground mt-2">No se pudo cargar la información del partido.</p>
          <Button className="mt-4" onClick={() => router.push(`/campeonato/${tournamentId}`)}>
            Volver al campeonato
          </Button>
        </Card>
      </div>
    )
  }

  const live = getLiveStateForMatch(match)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header principal */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href={`/campeonato/${tournamentId}`} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-xl tracking-tight">LaBaS</span>
                <p className="text-xs text-muted-foreground hidden sm:block">Volver al campeonato</p>
              </div>
            </Link>
          </div>
        </div>
      </header>

      {/* Match header */}
      <section className="bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="bg-neutral-900 text-white px-4 py-6 sm:px-6 lg:px-8 rounded-xl shadow-md">
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => router.push(`/campeonato/${tournamentId}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al campeonato
            </Button>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-8">
              {/* Izquierda: fecha + filas de equipos */}
              <div className="flex-1 space-y-3">
                <p className="text-sm text-white/80">
                  {match?.scheduledDate &&
                    match.scheduledDate.toLocaleDateString("es-AR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  {match?.scheduledTime && ` · ${match.scheduledTime}`}
                </p>

                {/* Local */}
                <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {match && (() => {
                    const bg = match.homeTeamPrimaryColor ?? "#666"
                    if (match.homeTeamLogoUrl) {
                      return (
                        <div className="h-10 w-10 rounded-full overflow-hidden border bg-primary-foreground/10 flex items-center justify-center shrink-0">
                          <img
                            src={match.homeTeamLogoUrl}
                            alt={match.homeTeamName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )
                    }
                    return (
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: bg }}
                      >
                        {match.homeTeamName.substring(0, 2).toUpperCase()}
                      </div>
                    )
                  })()}
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-white/70">Local</p>
                    <p className="text-lg font-semibold leading-tight truncate">
                      {match ? match.homeTeamName : "Equipo local"}
                    </p>
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-bold tabular-nums">
                  {live.homeScore}
                </div>
              </div>

                {/* Visitante */}
                <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {match && (() => {
                    const bg = match.awayTeamPrimaryColor ?? "#666"
                    if (match.awayTeamLogoUrl) {
                      return (
                        <div className="h-10 w-10 rounded-full overflow-hidden border bg-primary-foreground/10 flex items-center justify-center shrink-0">
                          <img
                            src={match.awayTeamLogoUrl}
                            alt={match.awayTeamName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )
                    }
                    return (
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: bg }}
                      >
                        {match.awayTeamName.substring(0, 2).toUpperCase()}
                      </div>
                    )
                  })()}
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-white/70">Visitante</p>
                    <p className="text-lg font-semibold leading-tight truncate">
                      {match ? match.awayTeamName : "Equipo visitante"}
                    </p>
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-bold tabular-nums">
                  {live.awayScore}
                </div>
                </div>
              </div>

              {/* Derecha: solo estado y tiempo de juego */}
              <div className="flex flex-col items-end gap-3 min-w-[160px]">
                <div className="flex items-center gap-2 text-xs sm:text-sm text-white/80">
                  <Clock className="h-4 w-4" />
                  <span>
                    {match?.status === "finalizado"
                      ? "Finalizado"
                      : match?.status === "en_juego"
                        ? `${
                            typeof live.period === "number" ? `Cuarto ${live.period}` : "En juego"
                          } · ${formatGameClock(live.gameTime)}`
                        : "Programado"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contenido: Historial & Estadísticas */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="historial" className="flex flex-col gap-4">
          <TabsList className="w-fit">
            <TabsTrigger value="historial">Historial</TabsTrigger>
            <TabsTrigger value="estadisticas">Estadísticas (próximo)</TabsTrigger>
          </TabsList>

          <TabsContent value="historial" className="mt-2">
            <Card>
              <CardHeader>
                <CardTitle>Historial del partido</CardTitle>
                <CardDescription>
                  Eventos ordenados por período y tiempo de juego.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay eventos registrados.</p>
                ) : (
                  events.map((ev, index) => {
                    const baseKey = `${ev.id}-${index}`

                    // Color de equipo principal para el evento (igual que en la mesa: local vs visitante)
                    const resolvedColor =
                      ev.teamColor ??
                      (match && ev.teamId
                        ? ev.teamId === match.homeTeamId
                          ? match.homeTeamPrimaryColor
                          : ev.teamId === match.awayTeamId
                            ? match.awayTeamPrimaryColor
                            : undefined
                        : undefined)

                    const baseIcon =
                      ev.type === "shot" || ev.type === "points"
                        ? "+"
                        : ev.type === "free_throw"
                          ? "TL"
                          : ev.type === "foul"
                            ? "F"
                            : ev.type === "rebound"
                              ? "R"
                              : ev.type === "steal"
                                ? "R"
                                : ev.type === "block"
                                  ? "T"
                                  : ev.type === "turnover"
                                    ? "P"
                                    : ""

                    // Nunca mostramos substitution_out sueltos; las sustituciones se renderizan desde substitution_in
                    if (ev.type === "substitution_out") {
                      return null
                    }

                    // Sustituciones: usamos solo substitution_in y buscamos el out asociado por timestamp/gameTime.
                    if (ev.type === "substitution_in") {
                      const pairedOut = events.find(
                        (e2) =>
                          e2.type === "substitution_out" &&
                          e2.period === ev.period &&
                          e2.gameTime === ev.gameTime &&
                          Math.abs(new Date(e2.timestamp).getTime() - new Date(ev.timestamp).getTime()) < 2000,
                      )

                      const outLabel = pairedOut?.playerName
                        ? `${pairedOut.jerseyNumber ? `#${pairedOut.jerseyNumber} ` : ""}${pairedOut.playerName}`
                        : "Jugador sale"

                      const inLabel = ev.playerName
                        ? `${ev.jerseyNumber ? `#${ev.jerseyNumber} ` : ""}${ev.playerName}`
                        : "Jugador entra"

                      return (
                        <Fragment key={baseKey}>
                          {/* Sustitución sale (acción anterior) */}
                          <div className="flex items-center justify-between gap-3 border-b py-1.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <div
                                className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                                style={{ backgroundColor: resolvedColor ?? "#111827" }}
                              >
                                ⇄
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">Sustitución sale</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {ev.gameTime} · Período {ev.period}
                                  {ev.teamName && ` · ${ev.teamName}`}
                                  {` · ${outLabel}`}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Sustitución entra (última acción) */}
                          <div className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <div
                                className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                                style={{ backgroundColor: resolvedColor ?? "#111827" }}
                              >
                                ⇄
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">Sustitución entra</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {ev.gameTime} · Período {ev.period}
                                  {ev.teamName && ` · ${ev.teamName}`}
                                  {` · ${inLabel}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </Fragment>
                      )
                    }

                    const hasVictim = !!ev.victimPlayerName

                    // Faltas con víctima: dos filas (recibida + cometida)
                    if (ev.type === "foul" && hasVictim) {
                      const victimLabel = `${
                        ev.victimJerseyNumber ? `#${ev.victimJerseyNumber} ` : ""
                      }${ev.victimPlayerName}`

                      return (
                        <Fragment key={baseKey}>
                          {/* Falta recibida */}
                          <div className="flex items-center justify-between gap-3 border-b py-1.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <div
                                className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                                style={{ backgroundColor: resolvedColor ?? "#111827" }}
                              >
                                F
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">Falta recibida</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {ev.gameTime} · Período {ev.period}
                                  {ev.teamName && ` · ${ev.teamName}`}
                                  {` · ${victimLabel}`}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Falta cometida */}
                          <div className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <div
                                className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                                style={{ backgroundColor: resolvedColor ?? "#111827" }}
                              >
                                F
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">
                                  {formatEventTitle(ev)}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {ev.gameTime} · Período {ev.period}
                                  {ev.teamName && ` · ${ev.teamName}`}
                                  {ev.playerName &&
                                    ` · ${ev.jerseyNumber ? `#${ev.jerseyNumber} ` : ""}${ev.playerName}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </Fragment>
                      )
                    }

                    // Tapas con víctima: dos filas (tapa recibida + tapa)
                    if (ev.type === "block" && hasVictim) {
                      const victimLabel = `${
                        ev.victimJerseyNumber ? `#${ev.victimJerseyNumber} ` : ""
                      }${ev.victimPlayerName}`

                      const victimColor =
                        match && ev.teamName
                          ? ev.teamName === match.homeTeamName
                            ? match.awayTeamPrimaryColor
                            : match.homeTeamPrimaryColor
                          : resolvedColor

                      return (
                        <Fragment key={baseKey}>
                          {/* Tapa recibida */}
                          <div className="flex items-center justify-between gap-3 border-b py-1.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <div
                                className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                                style={{ backgroundColor: victimColor ?? "#111827" }}
                              >
                                T
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">Tapa recibida</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {ev.gameTime} · Período {ev.period}
                                  {ev.teamName && ` · ${ev.teamName}`}
                                  {` · ${victimLabel}`}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Tapa */}
                          <div className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <div
                                className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                                style={{ backgroundColor: resolvedColor ?? "#111827" }}
                              >
                                T
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">Tapa</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {ev.gameTime} · Período {ev.period}
                                  {ev.teamName && ` · ${ev.teamName}`}
                                  {ev.playerName &&
                                    ` · ${ev.jerseyNumber ? `#${ev.jerseyNumber} ` : ""}${ev.playerName}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </Fragment>
                      )
                    }

                    // Resto de eventos en una fila
                    return (
                      <div
                        key={baseKey}
                        className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <div
                            className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                            style={{ backgroundColor: resolvedColor ?? "#111827" }}
                          >
                            {baseIcon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {formatEventTitle(ev)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {ev.gameTime} · Período {ev.period}
                              {ev.teamName && ` · ${ev.teamName}`}
                              {ev.playerName &&
                                ` · ${ev.jerseyNumber ? `#${ev.jerseyNumber} ` : ""}${ev.playerName}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="estadisticas" className="mt-2">
            <Card>
              <CardHeader>
                <CardTitle>Estadísticas del partido</CardTitle>
                <CardDescription>
                  Esta sección se implementará próximamente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Próximamente vas a poder ver acá estadísticas avanzadas del partido.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}