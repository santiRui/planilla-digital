"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface TeamPageProps {
  params: Promise<{ id: string; teamId: string }>
}

interface DbTeamRow {
  id: string
  name: string
  logo_url: string | null
  primary_color: string | null
}

interface TeamRow {
  id: string
  name: string
  logoUrl?: string | null
  primaryColor?: string | null
  club?: string | null
}

interface MatchRow {
  id: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  homeScore: number | null
  awayScore: number | null
  status: "programado" | "en_juego" | "finalizado"
}

interface StatRow {
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
}

interface PlayerInfo {
  id: string
  name: string
  number: number | null
}

export default function TeamStatsPage({ params }: TeamPageProps) {
  const { id: tournamentId, teamId } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [team, setTeam] = useState<TeamRow | null>(null)
  const [stats, setStats] = useState<StatRow[]>([])
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      // Equipo
      const { data: teamRow, error: teamError } = await supabase
        .from("teams")
        .select("id, name, logo_url, primary_color")
        .eq("id", teamId)
        .maybeSingle<DbTeamRow>()

      if (teamError || !teamRow) {
        setError(teamError?.message ?? "Equipo no encontrado")
        setLoading(false)
        return
      }

      setTeam({
        id: teamRow.id as string,
        name: teamRow.name as string,
        logoUrl: (teamRow.logo_url as string | null) ?? null,
        primaryColor: (teamRow.primary_color as string | null) ?? null,
        club: null,
      })

      // Partidos del torneo donde participa este equipo
      const { data: matchRows, error: matchError } = await supabase
        .from("matches")
        .select("id, home_team_id, away_team_id, home_score, away_score, status")
        .eq("tournament_id", tournamentId)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)

      if (matchError || !matchRows) {
        setError(matchError?.message ?? "No se pudieron cargar los partidos")
        setLoading(false)
        return
      }

      const matchIdsAll = (matchRows as any[]).map((m) => m.id as string)
      const finalizedMatchIds = (matchRows as any[])
        .filter((m) => m.status === "finalizado")
        .map((m) => m.id as string)

      // Stats del equipo en partidos finalizados
      let statRows: any[] = []
      if (finalizedMatchIds.length > 0) {
        const { data: statsData, error: statsError } = await supabase
          .from("match_player_stats")
          .select(
            "match_id, team_id, player_id, minutes, points, t1_made, t1_att, t2_made, t2_att, t3_made, t3_att, rebounds, assists, steals, turnovers, blocks_committed, blocks_received, fouls_committed, fouls_received",
          )
          .eq("team_id", teamId)
          .in("match_id", finalizedMatchIds)

        if (!statsError && statsData) {
          statRows = statsData as any[]
        }
      }

      const mappedStats: StatRow[] = statRows.map((r) => ({
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

      setStats(mappedStats)

      // Jugadores del equipo (aunque no tengan estadísticas registradas)
      const { data: playerRows, error: playerError } = await supabase
        .from("players")
        .select("id, first_name, last_name, jersey_number")
        .eq("team_id", teamId)

      if (!playerError && playerRows) {
        setPlayers(
          (playerRows as any[]).map((p) => ({
            id: p.id as string,
            name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Jugador",
            number: (p.jersey_number as number | null) ?? null,
          })),
        )
      } else {
        setPlayers([])
      }

      // Mapear partidos (solo para posible futuro uso, ahora no renderizamos por partido)
      const matchMap: MatchRow[] = (matchRows as any[]).map((m) => ({
        id: m.id as string,
        homeTeamId: m.home_team_id as string,
        awayTeamId: m.away_team_id as string,
        homeTeamName: "",
        awayTeamName: "",
        homeScore: m.home_score ?? null,
        awayScore: m.away_score ?? null,
        status: m.status as MatchRow["status"],
      }))

      const otherTeamIds = Array.from(
        new Set(
          (matchRows as any[])
            .flatMap((m) => [m.home_team_id, m.away_team_id])
            .filter((tid: string) => typeof tid === "string" && tid.length > 0),
        ),
      ) as string[]

      if (otherTeamIds.length > 0) {
        const { data: teamRows, error: teamErr } = await supabase
          .from("teams")
          .select("id, name")
          .in("id", otherTeamIds)

        if (!teamErr && teamRows) {
          const map = new Map<string, string>()
          for (const tr of teamRows as any[]) {
            map.set(tr.id as string, tr.name as string)
          }

          setMatches(
            matchMap.map((m) => ({
              ...m,
              homeTeamName: map.get(m.homeTeamId) ?? "Local",
              awayTeamName: map.get(m.awayTeamId) ?? "Visitante",
            })),
          )
        } else {
          setMatches(matchMap)
        }
      } else {
        setMatches(matchMap)
      }

      setLoading(false)
    }

    void run()
  }, [supabase, teamId, tournamentId])

  // Totales del equipo
  const teamTotals = useMemo(() => {
    return stats.reduce(
      (acc, r) => {
        acc.points += r.points
        acc.t1Made += r.t1Made
        acc.t1Att += r.t1Att
        acc.t2Made += r.t2Made
        acc.t2Att += r.t2Att
        acc.t3Made += r.t3Made
        acc.t3Att += r.t3Att
        acc.rebounds += r.rebounds
        acc.assists += r.assists
        acc.steals += r.steals
        acc.turnovers += r.turnovers
        acc.blocksCommitted += r.blocksCommitted
        acc.blocksReceived += r.blocksReceived
        acc.foulsCommitted += r.foulsCommitted
        acc.foulsReceived += r.foulsReceived
        return acc
      },
      {
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
      },
    )
  }, [stats])

  // Totales por jugador, partiendo de todos los jugadores del equipo
  const perPlayer = useMemo(() => {
    const map = new Map<
      string,
      {
        playerId: string
        gamesPlayed: number
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
      }
    >()

    // Inicializar todos los jugadores en 0
    for (const p of players) {
      map.set(p.id, {
        playerId: p.id,
        gamesPlayed: 0,
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
      })
    }

    // Sumar estadísticas oficiales. Solo contamos un partido como jugado
    // para el jugador si tiene al menos 1 segundo/minuto registrado.
    for (const r of stats) {
      const current = map.get(r.playerId)
      if (!current) continue

      if (r.minutes > 0) {
        current.gamesPlayed += 1
      }
      current.minutes += r.minutes
      current.points += r.points
      current.t1Made += r.t1Made
      current.t1Att += r.t1Att
      current.t2Made += r.t2Made
      current.t2Att += r.t2Att
      current.t3Made += r.t3Made
      current.t3Att += r.t3Att
      current.rebounds += r.rebounds
      current.assists += r.assists
      current.steals += r.steals
      current.turnovers += r.turnovers
      current.blocksCommitted += r.blocksCommitted
      current.blocksReceived += r.blocksReceived
      current.foulsCommitted += r.foulsCommitted
      current.foulsReceived += r.foulsReceived
    }

    return Array.from(map.values()).sort((a, b) => b.points - a.points)
  }, [players, stats])

  const playedMatchesCount = useMemo(() => {
    const matchIds = new Set(stats.map((s) => s.matchId))
    return matchIds.size
  }, [stats])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-50 border-b bg-card">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-xl tracking-tight">LaBaS</span>
              </div>
            </Link>
          </div>
        </header>
        <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-muted-foreground">Cargando estadísticas del equipo...</p>
        </main>
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-50 border-b bg-card">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-xl tracking-tight">LaBaS</span>
              </div>
            </Link>
          </div>
        </header>
        <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-10 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {error ?? "No se pudieron cargar los datos del equipo."}
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Activity className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight">LaBaS</span>
            </div>
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <button
          type="button"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
          onClick={() => router.push(`/campeonato/${tournamentId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver al campeonato
        </button>

        {/* Header del equipo */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {team.logoUrl ? (
              <div className="h-12 w-12 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
                style={{ backgroundColor: team.primaryColor ?? "#666" }}
              >
                {team.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <CardTitle className="text-2xl">{team.name}</CardTitle>
              {team.club && <CardDescription>{team.club}</CardDescription>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div>
              <div className="text-base font-semibold text-foreground">{playedMatchesCount}</div>
              <div>PJ</div>
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">{teamTotals.points}</div>
              <div>Puntos</div>
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">
                {teamTotals.t2Made + teamTotals.t3Made}
              </div>
              <div>Canastas de campo</div>
            </div>
          </div>
        </section>

        {/* Estadísticas de equipo (promedio por partido) */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estadísticas del equipo (promedio por partido)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.length === 0 || playedMatchesCount === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay estadísticas cargadas para este equipo.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground uppercase text-[10px]">
                        <th className="px-1 py-1 text-left">PJ</th>
                        <th className="px-1 py-1 text-right">PTS</th>
                        <th className="px-1 py-1 text-right">T1</th>
                        <th className="px-1 py-1 text-right">T2</th>
                        <th className="px-1 py-1 text-right">T3</th>
                        <th className="px-1 py-1 text-right">REB</th>
                        <th className="px-1 py-1 text-right">ASIS</th>
                        <th className="px-1 py-1 text-right">REC</th>
                        <th className="px-1 py-1 text-right">PER</th>
                        <th className="px-1 py-1 text-right">TAP C</th>
                        <th className="px-1 py-1 text-right">TAP R</th>
                        <th className="px-1 py-1 text-right">FC</th>
                        <th className="px-1 py-1 text-right">FR</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="px-1 py-1 text-left">{playedMatchesCount}</td>
                        <td className="px-1 py-1 text-right">{(teamTotals.points / playedMatchesCount).toFixed(1)}</td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.t1Made / playedMatchesCount).toFixed(1)}/
                          {(teamTotals.t1Att / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.t2Made / playedMatchesCount).toFixed(1)}/
                          {(teamTotals.t2Att / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.t3Made / playedMatchesCount).toFixed(1)}/
                          {(teamTotals.t3Att / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.rebounds / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.assists / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.steals / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.turnovers / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.blocksCommitted / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.blocksReceived / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.foulsCommitted / playedMatchesCount).toFixed(1)}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {(teamTotals.foulsReceived / playedMatchesCount).toFixed(1)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Estadísticas de jugadores (promedio por partido) */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estadísticas de jugadores (promedio por partido)</CardTitle>
            </CardHeader>
            <CardContent>
              {perPlayer.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay estadísticas cargadas para los jugadores.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground uppercase text-[10px]">
                        <th className="px-1 py-1 text-left">Jugador</th>
                        <th className="px-1 py-1 text-right">PJ</th>
                        <th className="px-1 py-1 text-right">PTS</th>
                        <th className="px-1 py-1 text-right">MIN</th>
                        <th className="px-1 py-1 text-right">T1</th>
                        <th className="px-1 py-1 text-right">T2</th>
                        <th className="px-1 py-1 text-right">T3</th>
                        <th className="px-1 py-1 text-right">REB</th>
                        <th className="px-1 py-1 text-right">ASIS</th>
                        <th className="px-1 py-1 text-right">REC</th>
                        <th className="px-1 py-1 text-right">PER</th>
                        <th className="px-1 py-1 text-right">TAP C</th>
                        <th className="px-1 py-1 text-right">TAP R</th>
                        <th className="px-1 py-1 text-right">FC</th>
                        <th className="px-1 py-1 text-right">FR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perPlayer.map((row) => {
                        const info = players.find((p) => p.id === row.playerId)
                        const gp = row.gamesPlayed || 1
                        return (
                          <tr key={row.playerId} className="border-t">
                            <td className="px-1 py-1 text-left">
                              <span className="font-medium">
                                {info?.number != null ? `#${info.number} ` : ""}
                                {info?.name ?? "Jugador"}
                              </span>
                            </td>
                            <td className="px-1 py-1 text-right">{row.gamesPlayed}</td>
                            <td className="px-1 py-1 text-right">{(row.points / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">{(row.minutes / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">
                              {(row.t1Made / gp).toFixed(1)}/{(row.t1Att / gp).toFixed(1)}
                            </td>
                            <td className="px-1 py-1 text-right">
                              {(row.t2Made / gp).toFixed(1)}/{(row.t2Att / gp).toFixed(1)}
                            </td>
                            <td className="px-1 py-1 text-right">
                              {(row.t3Made / gp).toFixed(1)}/{(row.t3Att / gp).toFixed(1)}
                            </td>
                            <td className="px-1 py-1 text-right">{(row.rebounds / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">{(row.assists / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">{(row.steals / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">{(row.turnovers / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">{(row.blocksCommitted / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">{(row.blocksReceived / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">{(row.foulsCommitted / gp).toFixed(1)}</td>
                            <td className="px-1 py-1 text-right">{(row.foulsReceived / gp).toFixed(1)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}