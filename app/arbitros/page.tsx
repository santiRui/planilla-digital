"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BadgeStatus } from "@/components/ui/badge-status"
import { ClipboardList, Calendar, MapPin, Clock, User } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export default function ArbitrosPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string>("Árbitro")
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [courts, setCourts] = useState<CourtRow[]>([])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setMatches([])
        setError("Tenés que iniciar sesión para ver tus partidos.")
        setLoading(false)
        return
      }

      const res = await fetch("/api/arbitros/matches", {
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setMatches([])
        setError(json?.error ?? "No se pudieron cargar los partidos")
        setLoading(false)
        return
      }

      setProfileName(json?.profile?.fullName ?? "Árbitro")

      const nextMatches = (json?.matches ?? []).map(mapMatchFromDb) as MatchRow[]
      setMatches(nextMatches)

      const teamIds = Array.from(
        new Set(nextMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean)),
      ) as string[]
      const tournamentIds = Array.from(new Set(nextMatches.map((m) => m.tournamentId).filter(Boolean))) as string[]
      const venueIds = Array.from(new Set(nextMatches.map((m) => m.venueId).filter(Boolean))) as string[]
      const courtIds = Array.from(new Set(nextMatches.map((m) => m.courtId).filter(Boolean))) as string[]

      const [teamsRes, tournamentsRes, venuesRes, courtsRes] = await Promise.all([
        teamIds.length > 0
          ? supabase.from("teams").select("id, name, primary_color, logo_url").in("id", teamIds)
          : Promise.resolve({ data: [], error: null } as any),
        tournamentIds.length > 0
          ? supabase.from("tournaments").select("id, name").in("id", tournamentIds)
          : Promise.resolve({ data: [], error: null } as any),
        venueIds.length > 0
          ? supabase.from("venues").select("id, name").in("id", venueIds)
          : Promise.resolve({ data: [], error: null } as any),
        courtIds.length > 0
          ? supabase.from("courts").select("id, name").in("id", courtIds)
          : Promise.resolve({ data: [], error: null } as any),
      ])

      if (teamsRes.error) setError((prev) => prev ?? teamsRes.error.message)
      if (tournamentsRes.error) setError((prev) => prev ?? tournamentsRes.error.message)
      if (venuesRes.error) setError((prev) => prev ?? venuesRes.error.message)
      if (courtsRes.error) setError((prev) => prev ?? courtsRes.error.message)

      setTeams((teamsRes.data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        primaryColor: t.primary_color,
        logoUrl: t.logo_url ?? "",
      })) as TeamRow[])

      setTournaments((tournamentsRes.data ?? []).map((t: any) => ({ id: t.id, name: t.name })) as TournamentRow[])
      setVenues((venuesRes.data ?? []).map((v: any) => ({ id: v.id, name: v.name })) as VenueRow[])
      setCourts((courtsRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name })) as CourtRow[])

      setLoading(false)
    }

    run()
  }, [supabase])

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "TBD"
  const getTeamColor = (id: string) => teams.find((t) => t.id === id)?.primaryColor || "#666"
  const getTeamLogo = (id: string) => teams.find((t) => t.id === id)?.logoUrl || ""
  const getTournamentName = (id: string) => tournaments.find((t) => t.id === id)?.name || "Torneo"
  const getVenueName = (id?: string | null) => venues.find((v) => v.id === id)?.name || "-"
  const getCourtName = (id?: string | null) => courts.find((c) => c.id === id)?.name || "-"

  const formatDate = (date?: Date) => {
    if (!date) return "Sin fecha"
    return new Date(date).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
  }

  const upcomingMatches = useMemo(() => {
    const list = matches.filter((m) => m.status !== "finalizado")
    list.sort((a, b) => {
      const aa = a.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      const bb = b.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (aa !== bb) return aa - bb
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    return list
  }, [matches])

  const finishedMatches = useMemo(() => {
    const list = matches.filter((m) => m.status === "finalizado")
    list.sort((a, b) => {
      const aa = a.scheduledAt?.getTime() ?? a.createdAt.getTime()
      const bb = b.scheduledAt?.getTime() ?? b.createdAt.getTime()
      return bb - aa
    })
    return list
  }, [matches])

  const startMatch = async (matchId: string) => {
    setError(null)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setError("Tenés que iniciar sesión para iniciar el partido.")
      return
    }

    const res = await fetch(`/api/arbitros/matches/${matchId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    const json = (await res.json().catch(() => null)) as any
    if (!res.ok) {
      setError(json?.error ?? "No se pudo iniciar el partido")
      return
    }

    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, status: "en_juego" } : m)))
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
              <User className="h-6 w-6 text-accent-foreground" />
            </div>
            <div>
              <h1 className="font-bold">Panel de Árbitros</h1>
              <p className="text-sm text-muted-foreground">
                {profileName}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto p-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Mis Partidos</h2>
          <p className="text-muted-foreground">Agenda de partidos asignados</p>
        </div>

        {error && <p className="text-sm text-destructive mb-4">{error}</p>}

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">Cargando partidos...</CardContent>
          </Card>
        ) : upcomingMatches.length === 0 && finishedMatches.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin partidos asignados"
            description="No tienes partidos asignados actualmente."
          />
        ) : (
          <div className="space-y-8">
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Próximos
              </h3>
              {upcomingMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tenés partidos próximos.</p>
              ) : (
                <div className="space-y-3">
                  {upcomingMatches.map((match) => (
                    <Card key={match.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              {getTournamentName(match.tournamentId)}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-sm text-muted-foreground">Fecha {match.round}</span>
                          </div>
                          <BadgeStatus status={match.status} />
                        </div>

                        <div className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3">
                            {getTeamLogo(match.homeTeamId) ? (
                              <div className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                <img src={getTeamLogo(match.homeTeamId)} alt={getTeamName(match.homeTeamId)} className="h-full w-full object-cover" />
                              </div>
                            ) : (
                              <div
                                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: getTeamColor(match.homeTeamId) }}
                              >
                                {getTeamName(match.homeTeamId).substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium">{getTeamName(match.homeTeamId)}</span>
                          </div>
                          <div className="px-4">
                            {match.status === "en_juego" ? (
                              <span className="text-xl font-bold text-[var(--color-live)]">
                                {match.homeScore ?? 0} - {match.awayScore ?? 0}
                              </span>
                            ) : (
                              <span className="text-lg font-bold text-muted-foreground">VS</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-right">{getTeamName(match.awayTeamId)}</span>
                            {getTeamLogo(match.awayTeamId) ? (
                              <div className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                <img src={getTeamLogo(match.awayTeamId)} alt={getTeamName(match.awayTeamId)} className="h-full w-full object-cover" />
                              </div>
                            ) : (
                              <div
                                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: getTeamColor(match.awayTeamId) }}
                              >
                                {getTeamName(match.awayTeamId).substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3 pt-3 border-t">
                          {match.scheduledTime && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              <span>{match.scheduledTime}</span>
                            </div>
                          )}
                          {match.venueId && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              <span>
                                {getVenueName(match.venueId)} - {getCourtName(match.courtId)}
                              </span>
                            </div>
                          )}
                          <div className="ml-auto">
                            <Button
                              size="sm"
                              onClick={() => startMatch(match.id)}
                              disabled={match.status !== "programado"}
                            >
                              Iniciar partido
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Finalizados
              </h3>
              {finishedMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no dirigiste partidos finalizados.</p>
              ) : (
                <div className="space-y-3">
                  {finishedMatches.map((match) => (
                    <Card key={match.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">{getTournamentName(match.tournamentId)}</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-sm text-muted-foreground">Fecha {match.round}</span>
                          </div>
                          <BadgeStatus status={match.status} />
                        </div>

                        <div className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3">
                            {getTeamLogo(match.homeTeamId) ? (
                              <div className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                <img src={getTeamLogo(match.homeTeamId)} alt={getTeamName(match.homeTeamId)} className="h-full w-full object-cover" />
                              </div>
                            ) : (
                              <div
                                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: getTeamColor(match.homeTeamId) }}
                              >
                                {getTeamName(match.homeTeamId).substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium">{getTeamName(match.homeTeamId)}</span>
                          </div>
                          <div className="px-4">
                            <span className="text-xl font-bold">
                              {match.homeScore ?? 0} - {match.awayScore ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-right">{getTeamName(match.awayTeamId)}</span>
                            {getTeamLogo(match.awayTeamId) ? (
                              <div className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                                <img src={getTeamLogo(match.awayTeamId)} alt={getTeamName(match.awayTeamId)} className="h-full w-full object-cover" />
                              </div>
                            ) : (
                              <div
                                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: getTeamColor(match.awayTeamId) }}
                              >
                                {getTeamName(match.awayTeamId).substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3 pt-3 border-t">
                          {match.scheduledDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(match.scheduledDate)}</span>
                            </div>
                          )}
                          {match.scheduledTime && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              <span>{match.scheduledTime}</span>
                            </div>
                          )}
                          {match.venueId && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              <span>
                                {getVenueName(match.venueId)} - {getCourtName(match.courtId)}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 border-t bg-card p-2">
        <div className="container mx-auto flex justify-around">
          <Link href="/arbitros" className="flex flex-col items-center py-2 px-4 text-primary">
            <ClipboardList className="h-5 w-5" />
            <span className="text-xs mt-1">Mis Partidos</span>
          </Link>
          <Link href="/" className="flex flex-col items-center py-2 px-4 text-muted-foreground hover:text-foreground">
            <Calendar className="h-5 w-5" />
            <span className="text-xs mt-1">Inicio</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}

type MatchRow = {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  round: number
  phase: string
  status: "programado" | "en_juego" | "finalizado"
  scheduledAt?: Date
  scheduledDate?: Date
  scheduledTime?: string
  venueId?: string | null
  courtId?: string | null
  homeScore?: number | null
  awayScore?: number | null
  createdAt: Date
}

type TeamRow = { id: string; name: string; primaryColor: string; logoUrl: string }
type TournamentRow = { id: string; name: string }
type VenueRow = { id: string; name: string }
type CourtRow = { id: string; name: string }

function mapMatchFromDb(row: any): MatchRow {
  const scheduledAt = row.scheduled_at ? new Date(row.scheduled_at) : undefined
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    round: row.round,
    phase: row.phase,
    status: row.status,
    scheduledAt,
    scheduledDate: scheduledAt,
    scheduledTime: scheduledAt
      ? scheduledAt.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : undefined,
    venueId: row.venue_id ?? null,
    courtId: row.court_id ?? null,
    homeScore: row.home_score ?? null,
    awayScore: row.away_score ?? null,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(0),
  }
}
