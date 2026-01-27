"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BadgeStatus } from "@/components/ui/badge-status"
import { ClipboardList, Play, Calendar, MapPin, Clock, Wifi, WifiOff } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { useState, useEffect, useMemo } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export default function MesaPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string>("Oficial de Mesa")
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [courts, setCourts] = useState<CourtRow[]>([])

  const [isOnline, setIsOnline] = useState(true)

  // Simulate checking online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

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

      const res = await fetch("/api/mesa/matches", {
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setMatches([])
        setError(json?.error ?? "No se pudieron cargar los partidos")
        setLoading(false)
        return
      }

      setProfileName(json?.profile?.fullName ?? "Oficial de Mesa")
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

  const activeMatches = useMemo(() => {
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold">Panel de Mesa</h1>
              <p className="text-sm text-muted-foreground">
                {profileName}
              </p>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
              isOnline
                ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {isOnline ? "Online" : "Offline"}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto p-4 pb-20">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Partidos Asignados</h2>
          <p className="text-muted-foreground">Selecciona un partido para iniciar la planilla digital</p>
        </div>

        {error && <p className="text-sm text-destructive mb-4">{error}</p>}

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">Cargando partidos...</CardContent>
          </Card>
        ) : activeMatches.length === 0 && finishedMatches.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin partidos asignados"
            description="No tienes partidos asignados para hoy."
          />
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              {activeMatches.map((match) => (
                <Card key={match.id} className="overflow-hidden">
                  <div
                    className={`h-1 ${
                      match.status === "en_juego"
                        ? "bg-[var(--color-live)]"
                        : match.status === "finalizado"
                          ? "bg-[var(--color-success)]"
                          : "bg-muted"
                    }`}
                  />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{getTournamentName(match.tournamentId)}</CardTitle>
                      <BadgeStatus status={match.status} />
                    </div>
                    <CardDescription>Fecha {match.round}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                  {/* Teams */}
                  <div className="flex items-center justify-between py-2">
                    <div className="text-center flex-1">
                      <p className="font-semibold text-lg">{getTeamName(match.homeTeamId)}</p>
                      <p className="text-sm text-muted-foreground">Local</p>
                    </div>
                    <div className="px-4">
                      {match.status !== "programado" ? (
                        <div className="flex items-center gap-3 text-3xl font-bold">
                          <span>{match.homeScore ?? 0}</span>
                          <span className="text-muted-foreground">-</span>
                          <span>{match.awayScore ?? 0}</span>
                        </div>
                      ) : (
                        <span className="text-2xl font-bold text-muted-foreground">VS</span>
                      )}
                    </div>
                    <div className="text-center flex-1">
                      <p className="font-semibold text-lg">{getTeamName(match.awayTeamId)}</p>
                      <p className="text-sm text-muted-foreground">Visitante</p>
                    </div>
                  </div>

                  {/* Match Info */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(match.scheduledDate)}</span>
                    </div>
                    {match.scheduledTime && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{match.scheduledTime}</span>
                      </div>
                    )}
                    {match.venueId && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>
                          {getVenueName(match.venueId)} - {getCourtName(match.courtId)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  {match.status === "en_juego" ? (
                    <Button className="w-full" size="lg" asChild>
                      <Link href={`/mesa/planilla/${match.id}/pre`}>
                        <Play className="mr-2 h-5 w-5" />
                        Iniciar Acta
                      </Link>
                    </Button>
                  ) : (
                    <Button className="w-full" size="lg" disabled>
                      Esperando que el árbitro inicie el partido
                    </Button>
                  )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div>
              <h3 className="font-semibold mb-3">Finalizados</h3>
              {finishedMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tenés partidos finalizados.</p>
              ) : (
                <div className="space-y-4">
                  {finishedMatches.map((match) => (
                    <Card key={match.id} className="overflow-hidden">
                      <div className="h-1 bg-[var(--color-success)]" />
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{getTournamentName(match.tournamentId)}</CardTitle>
                          <BadgeStatus status={match.status} />
                        </div>
                        <CardDescription>Fecha {match.round}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between py-2">
                          <div className="text-center flex-1">
                            <p className="font-semibold text-lg">{getTeamName(match.homeTeamId)}</p>
                            <p className="text-sm text-muted-foreground">Local</p>
                          </div>
                          <div className="px-4">
                            <div className="flex items-center gap-3 text-3xl font-bold">
                              <span>{match.homeScore ?? 0}</span>
                              <span className="text-muted-foreground">-</span>
                              <span>{match.awayScore ?? 0}</span>
                            </div>
                          </div>
                          <div className="text-center flex-1">
                            <p className="font-semibold text-lg">{getTeamName(match.awayTeamId)}</p>
                            <p className="text-sm text-muted-foreground">Visitante</p>
                          </div>
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
          <Button variant="ghost" className="flex-col h-auto py-2" asChild>
            <Link href="/mesa">
              <ClipboardList className="h-5 w-5" />
              <span className="text-xs mt-1">Partidos</span>
            </Link>
          </Button>
          <Button variant="ghost" className="flex-col h-auto py-2" asChild>
            <Link href="/">
              <Calendar className="h-5 w-5" />
              <span className="text-xs mt-1">Inicio</span>
            </Link>
          </Button>
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
