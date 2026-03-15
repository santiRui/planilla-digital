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
  playerId?: string
  victimPlayerId?: string
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

type UiPlayerStat = {
  playerId: string
  teamId: string
  jerseyNumber: number | null
  playerName: string
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
  rating: number
}

type UiPlayer = {
  id: string
  teamId: string
  firstName: string
  lastName: string
  jerseyNumber: number | null
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
  const [homePlayers, setHomePlayers] = useState<UiPlayer[]>([])
  const [awayPlayers, setAwayPlayers] = useState<UiPlayer[]>([])
  const [storedStats, setStoredStats] = useState<UiPlayerStat[] | null>(null)
  const [activeTab, setActiveTab] = useState<"historial" | "estadisticas">("historial")

  const playerStats = useMemo<UiPlayerStat[]>(() => {
    // Sólo mostramos estadísticas cuando el partido está finalizado
    if (!match || match.status !== "finalizado") return []
    if (storedStats && storedStats.length > 0) return storedStats
    return []
  }, [match, storedStats])

  // Eventos deduplicados para evitar mostrar acciones repetidas en el historial.
  const dedupedEvents = useMemo<UiEvent[]>(() => {
    const seen = new Set<string>()
    const result: UiEvent[] = []
    for (const ev of events) {
      const key = `${ev.type}|${ev.teamId ?? ""}|${ev.playerId ?? ""}|${ev.victimPlayerId ?? ""}|${ev.period}|${ev.gameTime}|${ev.points ?? ""}|${ev.shotType ?? ""}|${String(ev.made ?? "")}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push(ev)
    }
    return result
  }, [events])

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
        const [teamsRes, playersRes, statsRes] = await Promise.all([
          supabase
            .from("teams")
            .select("id, name, logo_url, primary_color")
            .in("id", teamIds),
          supabase
            .from("players")
            .select("id, team_id, first_name, last_name, jersey_number")
            .in("team_id", teamIds),
          supabase
            .from("match_player_stats_planilla")
            .select(
              "player_id, team_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, turnovers, blocks_committed, blocks_received, fouls_committed, fouls_received, rating, players(first_name, last_name, jersey_number)",
            )
            .eq("match_id", matchId),
        ])

        type TeamUiInfo = { name: string; logoUrl: string | null; primaryColor: string | null }

        const teamMap: Record<string, TeamUiInfo> = Object.fromEntries(
          (teamsRes.data ?? []).map((t: any) => [
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

        const allPlayers: UiPlayer[] = (playersRes.data ?? []).map((p: any) => ({
          id: p.id as string,
          teamId: p.team_id as string,
          firstName: p.first_name as string,
          lastName: p.last_name as string,
          jerseyNumber: (p.jersey_number as number | null) ?? null,
        }))

        setHomePlayers(allPlayers.filter((p) => p.teamId === mRow.home_team_id))
        setAwayPlayers(allPlayers.filter((p) => p.teamId === mRow.away_team_id))

        // Cargar estadísticas guardadas desde la planilla (match_player_stats)
        if (!statsRes.error && Array.isArray(statsRes.data)) {
          const statsFromDb: UiPlayerStat[] = (statsRes.data as any[]).map((row: any) => ({
            playerId: row.player_id as string,
            teamId: row.team_id as string,
            jerseyNumber: row.players?.jersey_number ?? null,
            playerName:
              row.players?.last_name && row.players?.first_name
                ? `${row.players.last_name}, ${row.players.first_name}`
                : "Jugador",
            minutes: typeof row.minutes === "number" ? row.minutes : 0,
            points: row.points ?? 0,
            t1Made: row.t1_made ?? 0,
            t1Att: row.t1_att ?? 0,
            t2Made: row.t2_made ?? 0,
            t2Att: row.t2_att ?? 0,
            t3Made: row.t3_made ?? 0,
            t3Att: row.t3_att ?? 0,
            rebounds: row.rebounds ?? 0,
            assists: row.assists ?? 0,
            steals: row.steals ?? 0,
            turnovers: row.turnovers ?? 0,
            blocksCommitted: row.blocks_committed ?? 0,
            blocksReceived: row.blocks_received ?? 0,
            foulsCommitted: row.fouls_committed ?? 0,
            foulsReceived: row.fouls_received ?? 0,
            rating: row.rating ?? 0,
          }))

          if (statsFromDb.length > 0) {
            setStoredStats(statsFromDb)
          }
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
          "id, team_id, player_id, victim_player_id, type, period, game_time, occurred_at, points, shot_type, made, team:teams!match_events_team_id_fkey(name, primary_color), player:players!match_events_player_id_fkey(first_name, last_name, jersey_number), victim_player:players!match_events_victim_player_id_fkey(first_name, last_name, jersey_number)",
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
          playerId: e.player_id as string | undefined,
          victimPlayerId: e.victim_player_id as string | undefined,
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
          "id, team_id, player_id, victim_player_id, type, period, game_time, occurred_at, points, shot_type, made, team:teams!match_events_team_id_fkey(name, primary_color), player:players!match_events_player_id_fkey(first_name, last_name, jersey_number), victim_player:players!match_events_victim_player_id_fkey(first_name, last_name, jersey_number)",
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
        playerId: e.player_id as string | undefined,
        victimPlayerId: e.victim_player_id as string | undefined,
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

  // Polling periódico para refrescar el historial incluso si falla el realtime.
  // No hace falta cuando el partido ya está finalizado.
  useEffect(() => {
    if (!matchId) return
    if (match?.status === "finalizado") return

    const interval = setInterval(async () => {
      const { data: evRows, error: evError } = await supabase
        .from("match_events")
        .select(
          "id, team_id, player_id, victim_player_id, type, period, game_time, occurred_at, points, shot_type, made, team:teams!match_events_team_id_fkey(name, primary_color), player:players!match_events_player_id_fkey(first_name, last_name, jersey_number), victim_player:players!match_events_victim_player_id_fkey(first_name, last_name, jersey_number)",
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
        playerId: e.player_id as string | undefined,
        victimPlayerId: e.victim_player_id as string | undefined,
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
    }, 10000) // cada 10 segundos

    return () => clearInterval(interval)
  }, [matchId, match?.status, supabase])

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

  const statsByPlayerId = useMemo(() => {
    const map = new Map<string, UiPlayerStat>()
    for (const s of playerStats) {
      map.set(s.playerId, s)
    }
    return map
  }, [playerStats])

  const homeTotals = useMemo(() => {
    const acc = {
      minutes: 0,
      points: 0,
      t1Made: 0,
      t1Att: 0,
      t2Made: 0,
      t2Att: 0,
      t3Made: 0,
      t3Att: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      turnovers: 0,
      blocksCommitted: 0,
      blocksReceived: 0,
      foulsCommitted: 0,
      foulsReceived: 0,
      rating: 0,
    }
    for (const p of homePlayers) {
      const s = statsByPlayerId.get(p.id)
      if (!s) continue
      acc.minutes += s.minutes
      acc.points += s.points
      acc.t1Made += s.t1Made
      acc.t1Att += s.t1Att
      acc.t2Made += s.t2Made
      acc.t2Att += s.t2Att
      acc.t3Made += s.t3Made
      acc.t3Att += s.t3Att
      acc.rebounds += s.rebounds
      acc.assists += s.assists
      acc.steals += s.steals
      acc.turnovers += s.turnovers
      acc.blocksCommitted += s.blocksCommitted
      acc.blocksReceived += s.blocksReceived
      acc.foulsCommitted += s.foulsCommitted
      acc.foulsReceived += s.foulsReceived
      acc.rating += s.rating
    }
    return acc
  }, [homePlayers, statsByPlayerId])

  const awayTotals = useMemo(() => {
    const acc = {
      minutes: 0,
      points: 0,
      t1Made: 0,
      t1Att: 0,
      t2Made: 0,
      t2Att: 0,
      t3Made: 0,
      t3Att: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      turnovers: 0,
      blocksCommitted: 0,
      blocksReceived: 0,
      foulsCommitted: 0,
      foulsReceived: 0,
      rating: 0,
    }
    for (const p of awayPlayers) {
      const s = statsByPlayerId.get(p.id)
      if (!s) continue
      acc.minutes += s.minutes
      acc.points += s.points
      acc.t1Made += s.t1Made
      acc.t1Att += s.t1Att
      acc.t2Made += s.t2Made
      acc.t2Att += s.t2Att
      acc.t3Made += s.t3Made
      acc.t3Att += s.t3Att
      acc.rebounds += s.rebounds
      acc.assists += s.assists
      acc.steals += s.steals
      acc.turnovers += s.turnovers
      acc.blocksCommitted += s.blocksCommitted
      acc.blocksReceived += s.blocksReceived
      acc.foulsCommitted += s.foulsCommitted
      acc.foulsReceived += s.foulsReceived
      acc.rating += s.rating
    }
    return acc
  }, [awayPlayers, statsByPlayerId])

  // Para partidos finalizados con estadísticas cargadas desde la planilla,
  // el marcador de cabecera debe reflejar exactamente los puntos sumados
  // de esas estadísticas, no el score persistido en matches (que podría
  // haber quedado desactualizado).
  const headerHomeScore =
    match?.status === "finalizado" && playerStats.length > 0 ? homeTotals.points : live.homeScore
  const headerAwayScore =
    match?.status === "finalizado" && playerStats.length > 0 ? awayTotals.points : live.awayScore

  // Sincronizar pestaña activa desde localStorage solo en el cliente para evitar
  // desajustes entre el HTML del servidor y el primer render del cliente.
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(`public-match-tab:${matchId}`)
    if (stored === "estadisticas" || stored === "historial") {
      setActiveTab(stored)
    }
  }, [matchId])

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
                  {headerHomeScore}
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
                  {headerAwayScore}
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
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const next = value === "estadisticas" ? "estadisticas" : "historial"
            setActiveTab(next)
            if (typeof window !== "undefined") {
              window.localStorage.setItem(`public-match-tab:${matchId}`, next)
            }
          }}
          className="flex flex-col gap-4"
        >
          <TabsList className="w-fit">
            <TabsTrigger value="historial">Historial</TabsTrigger>
            <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
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
                {dedupedEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay eventos registrados.</p>
                ) : (
                  dedupedEvents.map((ev, index) => {
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
                      const pairedOut = dedupedEvents.find(
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
                  Estadísticas finales por jugador basadas en la planilla digital.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(!match || !match.homeTeamId || !match.awayTeamId) && (
                  <p className="text-sm text-muted-foreground">
                    No se pudo determinar los equipos del partido.
                  </p>
                )}

                {match && match.homeTeamId && match.awayTeamId && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Local */}
                    <div className="rounded-lg border bg-card overflow-auto">
                      <div className="border-b px-3 py-2 text-sm font-semibold">{match.homeTeamName} – Estadísticas</div>
                      <div className="p-3">
                        <div className="min-w-[900px] overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b text-[11px] text-muted-foreground">
                                <th className="px-2 py-1 text-left w-10">#</th>
                                <th className="px-2 py-1 text-left w-40">Jugador</th>
                                <th className="px-2 py-1 text-right w-12">Min</th>
                                <th className="px-2 py-1 text-right w-12">Pts</th>
                                <th className="px-2 py-1 text-right w-16">T1</th>
                                <th className="px-2 py-1 text-right w-16">T2</th>
                                <th className="px-2 py-1 text-right w-16">T3</th>
                                <th className="px-2 py-1 text-right w-16">Reb</th>
                                <th className="px-2 py-1 text-right w-16">Asis</th>
                                <th className="px-2 py-1 text-right w-16">Rec</th>
                                <th className="px-2 py-1 text-right w-16">Per</th>
                                <th className="px-2 py-1 text-right w-16">Tap C</th>
                                <th className="px-2 py-1 text-right w-16">Tap R</th>
                                <th className="px-2 py-1 text-right w-16">FC</th>
                                <th className="px-2 py-1 text-right w-16">FR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {homePlayers
                                .slice()
                                .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999))
                                .map((p) => {
                                  const s = statsByPlayerId.get(p.id)
                                  const minutes = s?.minutes ?? 0
                                  const minutesDisplay = `${Math.floor(minutes)
                                    .toString()
                                    .padStart(2, "0")}:${Math.floor((minutes % 1) * 60)
                                    .toString()
                                    .padStart(2, "0")}`

                                  return (
                                    <tr key={p.id} className="border-b last:border-0">
                                      <td className="px-2 py-1 text-left font-semibold">{p.jerseyNumber ?? ""}</td>
                                      <td className="px-2 py-1 text-left whitespace-nowrap">{`${p.lastName.toUpperCase()}, ${p.firstName}`}</td>
                                      <td className="px-2 py-1 text-right">{minutesDisplay}</td>
                                      <td className="px-2 py-1 text-right font-semibold">{s?.points ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{(s?.t1Made ?? 0)}/{(s?.t1Att ?? 0)}</td>
                                      <td className="px-2 py-1 text-right">{(s?.t2Made ?? 0)}/{(s?.t2Att ?? 0)}</td>
                                      <td className="px-2 py-1 text-right">{(s?.t3Made ?? 0)}/{(s?.t3Att ?? 0)}</td>
                                      <td className="px-2 py-1 text-right">{s?.rebounds ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.assists ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.steals ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.turnovers ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.blocksCommitted ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.blocksReceived ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.foulsCommitted ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.foulsReceived ?? 0}</td>
                                      <td className="px-2 py-1 text-right font-semibold">{s?.rating ?? 0}</td>
                                    </tr>
                                  )
                                })}
                              {/* Totales equipo local */}
                              <tr className="border-t font-semibold bg-muted/40">
                                <td className="px-2 py-1 text-left" colSpan={2}>
                                  Total
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {`${Math.floor(homeTotals.minutes)
                                    .toString()
                                    .padStart(2, "0")}:${Math.floor((homeTotals.minutes % 1) * 60)
                                    .toString()
                                    .padStart(2, "0")}`}
                                </td>
                                <td className="px-2 py-1 text-right">{homeTotals.points}</td>
                                <td className="px-2 py-1 text-right">
                                  {homeTotals.t1Made}/{homeTotals.t1Att}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {homeTotals.t2Made}/{homeTotals.t2Att}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {homeTotals.t3Made}/{homeTotals.t3Att}
                                </td>
                                <td className="px-2 py-1 text-right">{homeTotals.rebounds}</td>
                                <td className="px-2 py-1 text-right">{homeTotals.assists}</td>
                                <td className="px-2 py-1 text-right">{homeTotals.steals}</td>
                                <td className="px-2 py-1 text-right">{homeTotals.turnovers}</td>
                                <td className="px-2 py-1 text-right">{homeTotals.blocksCommitted}</td>
                                <td className="px-2 py-1 text-right">{homeTotals.blocksReceived}</td>
                                <td className="px-2 py-1 text-right">{homeTotals.foulsCommitted}</td>
                                <td className="px-2 py-1 text-right">{homeTotals.foulsReceived}</td>
                                <td className="px-2 py-1 text-right">{homeTotals.rating}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Visitante */}
                    <div className="rounded-lg border bg-card overflow-auto">
                      <div className="border-b px-3 py-2 text-sm font-semibold">{match.awayTeamName} – Estadísticas</div>
                      <div className="p-3">
                        <div className="min-w-[900px] overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b text-[11px] text-muted-foreground">
                                <th className="px-2 py-1 text-left w-10">#</th>
                                <th className="px-2 py-1 text-left w-40">Jugador</th>
                                <th className="px-2 py-1 text-right w-12">Min</th>
                                <th className="px-2 py-1 text-right w-12">Pts</th>
                                <th className="px-2 py-1 text-right w-16">T1</th>
                                <th className="px-2 py-1 text-right w-16">T2</th>
                                <th className="px-2 py-1 text-right w-16">T3</th>
                                <th className="px-2 py-1 text-right w-16">Reb</th>
                                <th className="px-2 py-1 text-right w-16">Asis</th>
                                <th className="px-2 py-1 text-right w-16">Rec</th>
                                <th className="px-2 py-1 text-right w-16">Per</th>
                                <th className="px-2 py-1 text-right w-16">Tap C</th>
                                <th className="px-2 py-1 text-right w-16">Tap R</th>
                                <th className="px-2 py-1 text-right w-16">FC</th>
                                <th className="px-2 py-1 text-right w-16">FR</th>
                                <th className="px-2 py-1 text-right w-16">Val</th>
                              </tr>
                            </thead>
                            <tbody>
                              {awayPlayers
                                .slice()
                                .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999))
                                .map((p) => {
                                  const s = statsByPlayerId.get(p.id)
                                  const minutes = s?.minutes ?? 0
                                  const minutesDisplay = `${Math.floor(minutes)
                                    .toString()
                                    .padStart(2, "0")}:${Math.floor((minutes % 1) * 60)
                                    .toString()
                                    .padStart(2, "0")}`

                                  return (
                                    <tr key={p.id} className="border-b last:border-0">
                                      <td className="px-2 py-1 text-left font-semibold">{p.jerseyNumber ?? ""}</td>
                                      <td className="px-2 py-1 text-left whitespace-nowrap">{`${p.lastName.toUpperCase()}, ${p.firstName}`}</td>
                                      <td className="px-2 py-1 text-right">{minutesDisplay}</td>
                                      <td className="px-2 py-1 text-right font-semibold">{s?.points ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{(s?.t1Made ?? 0)}/{(s?.t1Att ?? 0)}</td>
                                      <td className="px-2 py-1 text-right">{(s?.t2Made ?? 0)}/{(s?.t2Att ?? 0)}</td>
                                      <td className="px-2 py-1 text-right">{(s?.t3Made ?? 0)}/{(s?.t3Att ?? 0)}</td>
                                      <td className="px-2 py-1 text-right">{s?.rebounds ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.assists ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.steals ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.turnovers ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.blocksCommitted ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.blocksReceived ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.foulsCommitted ?? 0}</td>
                                      <td className="px-2 py-1 text-right">{s?.foulsReceived ?? 0}</td>
                                      <td className="px-2 py-1 text-right font-semibold">{s?.rating ?? 0}</td>
                                    </tr>
                                  )
                                })}

                              {/* Totales equipo visitante */}
                              <tr className="border-t font-semibold bg-muted/40">
                                <td className="px-2 py-1 text-left" colSpan={2}>
                                  Total
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {`${Math.floor(awayTotals.minutes)
                                    .toString()
                                    .padStart(2, "0")}:${Math.floor((awayTotals.minutes % 1) * 60)
                                    .toString()
                                    .padStart(2, "0")}`}
                                </td>
                                <td className="px-2 py-1 text-right">{awayTotals.points}</td>
                                <td className="px-2 py-1 text-right">
                                  {awayTotals.t1Made}/{awayTotals.t1Att}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {awayTotals.t2Made}/{awayTotals.t2Att}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {awayTotals.t3Made}/{awayTotals.t3Att}
                                </td>
                                <td className="px-2 py-1 text-right">{awayTotals.rebounds}</td>
                                <td className="px-2 py-1 text-right">{awayTotals.assists}</td>
                                <td className="px-2 py-1 text-right">{awayTotals.steals}</td>
                                <td className="px-2 py-1 text-right">{awayTotals.turnovers}</td>
                                <td className="px-2 py-1 text-right">{awayTotals.blocksCommitted}</td>
                                <td className="px-2 py-1 text-right">{awayTotals.blocksReceived}</td>
                                <td className="px-2 py-1 text-right">{awayTotals.foulsCommitted}</td>
                                <td className="px-2 py-1 text-right">{awayTotals.foulsReceived}</td>
                                <td className="px-2 py-1 text-right">{awayTotals.rating}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}