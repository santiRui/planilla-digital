"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type Tournament = { id: string; name: string; year: number | null; categoryId: string | null }

type Team = { id: string; name: string }

type Player = {
  id: string
  teamId: string
  firstName: string
  lastName: string
  jerseyNumber: number | null
}

type MatchRow = {
  id: string
  round: number | null
  phase: string | null
  status: string | null
  scheduledAt: string | null
  startedAt: string | null
  finishedAt: string | null
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  homeScore: number | null
  awayScore: number | null
}

type PlayerMatchStatRow = {
  matchId: string
  teamId: string
  playerId: string
  source: "planilla" | "legacy"
  minutes: number | string | null
  points: number | null
  t1Made: number | null
  t1Att: number | null
  t2Made: number | null
  t2Att: number | null
  t3Made: number | null
  t3Att: number | null
  rebounds: number | null
  assists: number | null
  steals: number | null
  turnovers: number | null
  blocksCommitted: number | null
  blocksReceived: number | null
  foulsCommitted: number | null
  foulsReceived: number | null
  rating: number | null
}

type PlayerStatsResponse = {
  rows: PlayerMatchStatRow[]
  matches: MatchRow[]
}

export default function EstadisticasPorJugadorPage() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [accessToken, setAccessToken] = useState<string | null>(null)

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState("")
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState("")
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PlayerStatsResponse | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null)
    })
  }, [supabase])

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, year, category_id")
        .order("created_at", { ascending: false })

      if (error) {
        setTournaments([])
        setError(error.message)
        return
      }

      setTournaments(
        (data ?? []).map((t: any) => ({
          id: String(t.id),
          name: String(t.name ?? ""),
          year: (t.year as number | null) ?? null,
          categoryId: (t.category_id as string | null) ?? null,
        })) as Tournament[],
      )
    }

    void run()
  }, [supabase])

  useEffect(() => {
    const run = async () => {
      setTeams([])
      setSelectedTeamId("")
      setPlayers([])
      setSelectedPlayerId("")
      setData(null)

      if (!selectedTournamentId) return

      setError(null)

      const tournament = tournaments.find((t) => t.id === selectedTournamentId)
      const categoryId = tournament?.categoryId

      if (!categoryId) {
        setTeams([])
        return
      }

      const { data: teamCategoryRows, error: teamCategoryError } = await supabase
        .from("team_categories")
        .select("team_id")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: true })

      if (teamCategoryError) {
        setTeams([])
        setError(teamCategoryError.message)
        return
      }

      const teamIds = Array.from(new Set((teamCategoryRows ?? []).map((r: any) => r.team_id).filter(Boolean))) as string[]
      if (teamIds.length === 0) {
        setTeams([])
        return
      }

      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", teamIds)
        .order("name", { ascending: true })

      if (teamsError) {
        setTeams([])
        setError(teamsError.message)
        return
      }

      setTeams((teamsData ?? []).map((t: any) => ({ id: String(t.id), name: String(t.name ?? "") })))
    }

    void run()
  }, [selectedTournamentId, supabase, tournaments])

  useEffect(() => {
    const run = async () => {
      setPlayers([])
      setSelectedPlayerId("")
      setData(null)

      if (!selectedTeamId) return

      const { data, error } = await supabase
        .from("players")
        .select("id, team_id, first_name, last_name, jersey_number")
        .eq("team_id", selectedTeamId)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })

      if (error) {
        setPlayers([])
        setError(error.message)
        return
      }

      setPlayers(
        (data ?? []).map((p: any) => ({
          id: String(p.id),
          teamId: String(p.team_id),
          firstName: String(p.first_name ?? ""),
          lastName: String(p.last_name ?? ""),
          jerseyNumber: (p.jersey_number as number | null) ?? null,
        })),
      )
    }

    void run()
  }, [selectedTeamId, supabase])

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId) ?? null
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null
  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId) ?? null

  const matchById = useMemo(() => {
    const map = new Map<string, MatchRow>()
    for (const m of data?.matches ?? []) map.set(m.id, m)
    return map
  }, [data])

  const rowsWithMatch = useMemo(() => {
    return (data?.rows ?? [])
      .map((r) => ({ r, m: matchById.get(r.matchId) ?? null }))
      .sort((a, b) => {
        const da = a.m?.scheduledAt ?? a.m?.startedAt ?? a.m?.finishedAt ?? ""
        const db = b.m?.scheduledAt ?? b.m?.startedAt ?? b.m?.finishedAt ?? ""
        return da.localeCompare(db)
      })
  }, [data, matchById])

  const totals = useMemo(() => {
    const base = {
      games: 0,
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
    }

    for (const { r } of rowsWithMatch) {
      base.games += 1
      base.points += Number(r.points ?? 0)
      base.t1Made += Number(r.t1Made ?? 0)
      base.t1Att += Number(r.t1Att ?? 0)
      base.t2Made += Number(r.t2Made ?? 0)
      base.t2Att += Number(r.t2Att ?? 0)
      base.t3Made += Number(r.t3Made ?? 0)
      base.t3Att += Number(r.t3Att ?? 0)
      base.rebounds += Number(r.rebounds ?? 0)
      base.assists += Number(r.assists ?? 0)
      base.steals += Number(r.steals ?? 0)
      base.turnovers += Number(r.turnovers ?? 0)
      base.blocksCommitted += Number(r.blocksCommitted ?? 0)
      base.blocksReceived += Number(r.blocksReceived ?? 0)
      base.foulsCommitted += Number(r.foulsCommitted ?? 0)
      base.foulsReceived += Number(r.foulsReceived ?? 0)
    }

    return base
  }, [rowsWithMatch])

  const formatMinutes = (value: number | string | null) => {
    if (value == null) return "-"
    if (typeof value === "string") {
      const raw = value.trim()
      if (!raw) return "-"
      if (/^\d{1,3}:\d{2}$/.test(raw)) return raw
    }

    const asNum = typeof value === "number" ? value : Number(String(value))
    if (!Number.isFinite(asNum)) return String(value)

    const totalSeconds = Math.max(0, Math.round(asNum * 60))
    const mm = Math.floor(totalSeconds / 60)
    const ss = totalSeconds % 60
    return `${mm}:${ss.toString().padStart(2, "0")}`
  }

  async function load() {
    try {
      setError(null)
      setData(null)

      if (!accessToken) {
        setError("Tenés que iniciar sesión como administrador.")
        return
      }
      if (!selectedTournamentId) {
        setError("Seleccioná un torneo.")
        return
      }
      if (!selectedTeamId) {
        setError("Seleccioná un equipo.")
        return
      }
      if (!selectedPlayerId) {
        setError("Seleccioná una jugadora.")
        return
      }

      setLoading(true)

      const qs = new URLSearchParams({ teamId: selectedTeamId, playerId: selectedPlayerId })
      const res = await fetch(`/api/admin/tournaments/${selectedTournamentId}/player-stats?${qs.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudieron cargar las estadísticas")
        return
      }

      setData(json as PlayerStatsResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Estadísticas por jugadora</h1>
          <Button variant="outline" onClick={() => router.back()}>
            Volver
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Torneo</div>
              <Select value={selectedTournamentId} onValueChange={setSelectedTournamentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar torneo" />
                </SelectTrigger>
                <SelectContent>
                  {tournaments.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.year ? `(${t.year})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Equipo</div>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger disabled={!selectedTournamentId}>
                  <SelectValue placeholder={!selectedTournamentId ? "Elegí torneo" : "Seleccionar equipo"} />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Jugadora</div>
              <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                <SelectTrigger disabled={!selectedTeamId}>
                  <SelectValue placeholder={!selectedTeamId ? "Elegí equipo" : "Seleccionar jugadora"} />
                </SelectTrigger>
                <SelectContent>
                  {players.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ""}
                      {p.lastName} {p.firstName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button className="w-full" disabled={loading} onClick={load}>
                {loading ? "Cargando..." : "Ver partidos"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card>
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {data && (
          <Card>
            <CardHeader>
              <CardTitle>
                Totales del torneo{selectedTournament ? `: ${selectedTournament.name}` : ""}
                {selectedTeam ? ` | ${selectedTeam.name}` : ""}
                {selectedPlayer ? ` | ${selectedPlayer.lastName} ${selectedPlayer.firstName}` : ""}
                {selectedPlayer ? ` | ${selectedPlayer.id}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
              <div>
                <div className="text-muted-foreground">PJ</div>
                <div className="font-semibold">{totals.games}</div>
              </div>
              <div>
                <div className="text-muted-foreground">PTS</div>
                <div className="font-semibold">{totals.points}</div>
              </div>
              <div>
                <div className="text-muted-foreground">3PM / 3PA</div>
                <div className="font-semibold">
                  {totals.t3Made} / {totals.t3Att}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">AST / REB</div>
                <div className="font-semibold">
                  {totals.assists} / {totals.rebounds}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Partidos con estadísticas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Partido</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-center">Fuente</TableHead>
                    <TableHead className="text-center">MIN</TableHead>
                    <TableHead className="text-center">PTS</TableHead>
                    <TableHead className="text-center">T1</TableHead>
                    <TableHead className="text-center">T2</TableHead>
                    <TableHead className="text-center">T3</TableHead>
                    <TableHead className="text-center">REB</TableHead>
                    <TableHead className="text-center">AST</TableHead>
                    <TableHead className="text-center">ROB</TableHead>
                    <TableHead className="text-center">TAP</TableHead>
                    <TableHead className="text-center">F</TableHead>
                    <TableHead className="text-center">PERD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsWithMatch.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                        Seleccioná torneo, equipo y jugadora y tocá "Ver partidos".
                      </TableCell>
                    </TableRow>
                  ) : (
                    rowsWithMatch.map(({ r, m }, idx) => {
                      const title = m
                        ? `${m.homeTeamName} vs ${m.awayTeamName}${m.homeScore != null && m.awayScore != null ? ` (${m.homeScore}-${m.awayScore})` : ""}`
                        : r.matchId

                      return (
                        <TableRow key={r.matchId}>
                          <TableCell className="font-semibold">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">{title}</div>
                            {m?.scheduledAt && <div className="text-xs text-muted-foreground">{m.scheduledAt}</div>}
                          </TableCell>
                          <TableCell className="text-center">{m?.status ?? "-"}</TableCell>
                          <TableCell className="text-center">{r.source}</TableCell>
                          <TableCell className="text-center">{formatMinutes(r.minutes)}</TableCell>
                          <TableCell className="text-center font-semibold">{r.points ?? 0}</TableCell>
                          <TableCell className="text-center">
                            {r.t1Made ?? 0}/{r.t1Att ?? 0}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.t2Made ?? 0}/{r.t2Att ?? 0}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.t3Made ?? 0}/{r.t3Att ?? 0}
                          </TableCell>
                          <TableCell className="text-center">{r.rebounds ?? 0}</TableCell>
                          <TableCell className="text-center">{r.assists ?? 0}</TableCell>
                          <TableCell className="text-center">{r.steals ?? 0}</TableCell>
                          <TableCell className="text-center">{r.blocksCommitted ?? 0}</TableCell>
                          <TableCell className="text-center">{r.foulsCommitted ?? 0}</TableCell>
                          <TableCell className="text-center">{r.turnovers ?? 0}</TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
