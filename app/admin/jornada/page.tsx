"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { BadgeStatus } from "@/components/ui/badge-status"
import { Calendar, Clock, MapPin } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function JornadaPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])

  const [selectedVenue, setSelectedVenue] = useState<string>("")
  const [selectedDate, setSelectedDate] = useState<string>("") // YYYY-MM-DD

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusDialogMatch, setStatusDialogMatch] = useState<MatchRow | null>(null)
  const [statusDialogStatus, setStatusDialogStatus] = useState<"suspendido" | "demorado">("suspendido")
  const [statusDialogReason, setStatusDialogReason] = useState("")
  const [statusDialogDelayMinutes, setStatusDialogDelayMinutes] = useState("")
  const [statusDialogSubmitting, setStatusDialogSubmitting] = useState(false)
  const [statusDialogError, setStatusDialogError] = useState<string | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  // Load tournaments, venues, courts
  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const [tournamentsRes, venuesRes, courtsRes] = await Promise.all([
        supabase.from("tournaments").select("id, name, year, branch, status, created_at, category_id").order("created_at", { ascending: false }),
        supabase.from("venues").select("id, name").order("name", { ascending: true }),
        supabase.from("courts").select("id, venue_id, name").order("name", { ascending: true }),
      ])

      if (tournamentsRes.error) setError(tournamentsRes.error.message)
      if (venuesRes.error) setError((prev) => prev ?? venuesRes.error.message)
      if (courtsRes.error) setError((prev) => prev ?? courtsRes.error.message)

      const nextTournaments = (tournamentsRes.data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        year: t.year,
        branch: t.branch,
        status: t.status,
        createdAt: t.created_at,
        categoryId: t.category_id,
      })) as Tournament[]
      setTournaments(nextTournaments)

      setVenues((venuesRes.data ?? []).map((v: any) => ({ id: v.id, name: v.name })) as Venue[])
      setCourts((courtsRes.data ?? []).map((c: any) => ({ id: c.id, venueId: c.venue_id, name: c.name })) as Court[])

      setLoading(false)
    }

    run()
  }, [supabase])

  // Load all matches (no need to select tournament)
  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return

      setLoading(true)
      setError(null)

      const res = await fetch("/api/admin/matches", {
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setMatches([])
        setTeams([])
        setError(json?.error ?? "No se pudieron cargar los partidos")
      } else {
        const rawMatches = (json.matches ?? []) as any[]

        // Para partidos finalizados, recalculamos el score a partir de las
        // estadísticas de la planilla (match_player_stats_planilla), para que
        // siempre coincida con los puntos sumados por jugador.
        const finishedMatchIds = rawMatches
          .filter((m) => m?.status === "finalizado" && m?.id)
          .map((m) => String(m.id))

        let matchesWithPlanillaScores = rawMatches

        if (finishedMatchIds.length > 0) {
          const { data: statsRows, error: statsError } = await supabase
            .from("match_player_stats_planilla")
            .select("match_id, team_id, points")
            .in("match_id", finishedMatchIds)

          if (!statsError && Array.isArray(statsRows)) {
            const totalsByMatch: Record<string, Record<string, number>> = {}

            for (const row of statsRows as any[]) {
              const matchId = String(row.match_id)
              const teamId = String(row.team_id)
              const pts = typeof row.points === "number" ? row.points : 0
              if (!totalsByMatch[matchId]) totalsByMatch[matchId] = {}
              totalsByMatch[matchId][teamId] = (totalsByMatch[matchId][teamId] ?? 0) + pts
            }

            matchesWithPlanillaScores = rawMatches.map((m) => {
              const matchId = String(m.id)
              const totalsForMatch = totalsByMatch[matchId]
              if (m.status !== "finalizado" || !totalsForMatch) return m

              const homePts = totalsForMatch[String(m.home_team_id)]
              const awayPts = totalsForMatch[String(m.away_team_id)]

              if (typeof homePts !== "number" && typeof awayPts !== "number") return m

              return {
                ...m,
                home_score: typeof homePts === "number" ? homePts : m.home_score,
                away_score: typeof awayPts === "number" ? awayPts : m.away_score,
              }
            })
          }
        }

        setMatches(matchesWithPlanillaScores.map(mapMatchFromDb) as MatchRow[])

        const matchTeamIds = Array.from(
          new Set(
            rawMatches
              .flatMap((m) => [m?.home_team_id, m?.away_team_id])
              .filter(Boolean)
              .map((id) => String(id)),
          ),
        ) as string[]

        if (matchTeamIds.length > 0) {
          const { data: matchTeams, error: matchTeamsError } = await supabase
            .from("teams")
            .select("id, name")
            .in("id", matchTeamIds)

          if (matchTeamsError) {
            setError((prev) => prev ?? matchTeamsError.message)
          } else {
            setTeams((matchTeams ?? []).map((t: any) => ({ id: t.id, name: t.name })) as Team[])
          }
        } else {
          setTeams([])
        }
      }

      setLoading(false)
    }

    run()
  }, [supabase])

  const jornadaMatches = matches
    .filter((m) => {
      if (selectedVenue && m.venueId !== selectedVenue) return false
      if (!selectedDate) return false
      if (!m.scheduledDate) return false
      const dateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Salta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(m.scheduledDate))
      return dateStr === selectedDate
    })
    .sort((a, b) => {
      const ta = a.scheduledTime ?? "23:59"
      const tb = b.scheduledTime ?? "23:59"
      if (ta < tb) return -1
      if (ta > tb) return 1
      return a.createdAt.getTime() - b.createdAt.getTime()
    })

  const getTournamentName = (id: string) => tournaments.find((t: Tournament) => t.id === id)?.name || "Torneo"
  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "TBD"
  const getVenueName = (id?: string | null) => venues.find((v) => v.id === id)?.name || "-"
  const getCourtName = (id?: string | null) => courts.find((c) => c.id === id)?.name || "-"

  const formatTime = (d?: Date | null) => {
    if (!d) return "-"
    return d.toTimeString().slice(0, 5)
  }

  const formatDuration = (start?: Date | null, end?: Date | null) => {
    if (!start || !end) return "-"
    const ms = end.getTime() - start.getTime()
    if (ms <= 0) return "-"
    const totalMinutes = Math.round(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours <= 0) return `${minutes} min`
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`
  }

  const openStatusDialog = (match: MatchRow, status: "suspendido" | "demorado") => {
    setStatusDialogMatch(match)
    setStatusDialogStatus(status)
    setStatusDialogReason("")
    setStatusDialogDelayMinutes("")
    setStatusDialogError(null)
  }

  const handleConfirmStatusChange = async () => {
    if (!statusDialogMatch) return
    setStatusDialogSubmitting(true)
    setStatusDialogError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setStatusDialogError("Tenés que iniciar sesión para cambiar el estado del partido.")
        return
      }

      let body: any

      if (statusDialogStatus === "suspendido") {
        // Partido suspendido: sólo cambiamos estado y motivo de suspensión
        body = {
          status: "suspendido",
          statusReason: statusDialogReason || null,
        }
      } else {
        // Partido demorado: opcionalmente se corre el horario X minutos hacia adelante
        const minutes = parseInt(statusDialogDelayMinutes || "0", 10)

        if (minutes > 0 && statusDialogMatch.scheduledDate) {
          const base = new Date(statusDialogMatch.scheduledDate)
          const newDate = new Date(base.getTime() + minutes * 60 * 1000)
          const iso = newDate.toISOString()
          const scheduledDate = iso.split("T")[0]
          const scheduledTime = iso.substring(11, 16)

          body = {
            scheduledDate,
            scheduledTime,
            venueId: statusDialogMatch.venueId ?? null,
            courtId: statusDialogMatch.courtId ?? null,
            refereeIds: statusDialogMatch.refereeIds,
            tableOfficialIds: statusDialogMatch.tableOfficialIds,
            status: "demorado",
            statusReason: null,
          }
        } else {
          // Sin minutos de demora: sólo marcamos el estado como demorado
          body = {
            status: "demorado",
            statusReason: null,
          }
        }
      }

      const res = await fetch(`/api/admin/matches/${statusDialogMatch.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setStatusDialogError(json?.error ?? "No se pudo actualizar el partido")
        return
      }

      const updated = mapMatchFromDb(json.match)
      setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      setStatusDialogMatch(null)
      setStatusDialogReason("")
      setStatusDialogDelayMinutes("")
    } finally {
      setStatusDialogSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Jornada" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Jornada</h1>
          <p className="text-muted-foreground mt-1">
            Visualiza los partidos de una cancha en una fecha, con estados en vivo y resultados.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="venue">Sede</Label>
              <Select
                value={selectedVenue}
                onValueChange={(v) => {
                  setSelectedVenue(v)
                }}
              >
                <SelectTrigger id="venue">
                  <SelectValue placeholder="Seleccionar sede" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando partidos...</CardContent>
        </Card>
      ) : !selectedVenue || !selectedDate ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Seleccioná sede y fecha para ver la jornada.
          </CardContent>
        </Card>
      ) : jornadaMatches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay partidos programados para esta sede en esa fecha.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horario prog.</TableHead>
                  <TableHead>Inicio real</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Partido</TableHead>
                  <TableHead>Torneo / Fecha</TableHead>
                  <TableHead>Sede / Cancha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[160px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jornadaMatches.map((match) => (
                  <TableRow key={match.id}>
                    <TableCell className="whitespace-nowrap">
                      {match.scheduledTime ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{match.scheduledTime}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Sin hora</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatTime(match.startedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatTime(match.finishedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDuration(match.startedAt, match.finishedAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}
                      </div>
                      {match.status === "finalizado" && (
                        <Link
                          href={`/campeonato/${match.tournamentId}/partido/${match.id}`}
                          className="text-sm text-muted-foreground underline underline-offset-2 cursor-pointer"
                        >
                          Resultado: {match.homeScore ?? 0} - {match.awayScore ?? 0}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{getTournamentName(match.tournamentId)}</div>
                        <div className="text-muted-foreground text-xs">Fecha {match.round}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{getVenueName(match.venueId)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <BadgeStatus status={match.status} />
                        {match.status === "suspendido" && match.statusReason && (
                          <span className="text-xs text-muted-foreground">Suspendido: {match.statusReason}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openStatusDialog(match, "demorado")}
                        disabled={match.status === "finalizado" || match.status === "suspendido" || match.status === "demorado"}
                      >
                        Marcar demorado
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openStatusDialog(match, "suspendido")}
                        disabled={match.status === "finalizado" || match.status === "suspendido"}
                      >
                        Suspender
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!statusDialogMatch} onOpenChange={(open) => (!open ? setStatusDialogMatch(null) : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {statusDialogStatus === "suspendido" ? "Suspender partido" : "Marcar partido como demorado"}
            </DialogTitle>
            <DialogDescription>
              {statusDialogMatch && (
                <>
                  {getTeamName(statusDialogMatch.homeTeamId)} vs {getTeamName(statusDialogMatch.awayTeamId)} - Fecha {statusDialogMatch.round}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {statusDialogStatus === "suspendido" ? (
              <div className="grid gap-2">
                <Label htmlFor="status-reason">Motivo (opcional)</Label>
                <Input
                  id="status-reason"
                  value={statusDialogReason}
                  onChange={(e) => setStatusDialogReason(e.target.value)}
                  placeholder="Ej: Corte de luz, humedad en la cancha, etc."
                />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="delay-minutes">Demora en minutos (opcional)</Label>
                <Input
                  id="delay-minutes"
                  type="number"
                  min={0}
                  value={statusDialogDelayMinutes}
                  onChange={(e) => setStatusDialogDelayMinutes(e.target.value)}
                  placeholder="Ej: 15"
                />
              </div>
            )}
            {statusDialogError && <p className="text-sm text-destructive">{statusDialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogMatch(null)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmStatusChange} disabled={statusDialogSubmitting}>
              {statusDialogSubmitting
                ? statusDialogStatus === "suspendido"
                  ? "Suspendiendo..."
                  : "Marcando como demorado..."
                : statusDialogStatus === "suspendido"
                  ? "Confirmar suspensión"
                  : "Confirmar demorado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Tournament = {
  id: string
  name: string
  year: number
  branch: string
  status: string
  createdAt: string
  categoryId?: string | null
}

type Venue = {
  id: string
  name: string
}

type Court = {
  id: string
  venueId: string
  name: string
}

type Team = {
  id: string
  name: string
}

type MatchRow = {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  round: number
  phase: string
  status: "programado" | "en_juego" | "finalizado" | "suspendido" | "demorado"
  statusReason?: string | null
  scheduledDate?: Date
  scheduledTime?: string
  venueId?: string | null
  courtId?: string | null
  homeScore?: number | null
  awayScore?: number | null
  startedAt?: Date | null
  finishedAt?: Date | null
  refereeIds: string[]
  tableOfficialIds: string[]
  createdAt: Date
}

function mapMatchFromDb(row: any): MatchRow {
  const rawScheduled: string | null = row.scheduled_at ?? null
  const scheduledAt = rawScheduled
    ? new Date(
        /Z$/i.test(rawScheduled) || /[+-]\d{2}:\d{2}$/.test(rawScheduled) ? rawScheduled : `${rawScheduled}-03:00`,
      )
    : undefined
  const scheduledTime = scheduledAt
    ? new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Salta",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(scheduledAt)
    : undefined

  const assignments = (row.match_official_assignments ?? []) as Array<{ user_id: string; role: string }>

  const refereeIds = assignments.filter((a) => a.role === "arbitro").map((a) => a.user_id)
  const tableOfficialIds = assignments.filter((a) => a.role === "oficial_mesa").map((a) => a.user_id)

  return {
    id: row.id,
    tournamentId: row.tournament_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    round: row.round,
    phase: row.phase,
    status: row.status,
    statusReason: row.status_reason ?? null,
    scheduledDate: scheduledAt,
    scheduledTime,
    venueId: row.venue_id ?? null,
    courtId: row.court_id ?? null,
    homeScore: row.home_score ?? null,
    awayScore: row.away_score ?? null,
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
    refereeIds,
    tableOfficialIds,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(0),
  }
}
