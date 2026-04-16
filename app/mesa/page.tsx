"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BadgeStatus } from "@/components/ui/badge-status"
import { ClipboardList, Play, Calendar, MapPin, Clock, Wifi, WifiOff } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { useState, useEffect, useMemo } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LogoutButton } from "@/components/auth/logout-button"

export default function MesaPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string>("Oficial de Mesa")
  const [canSwitchToArbitros, setCanSwitchToArbitros] = useState(false)
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [courts, setCourts] = useState<CourtRow[]>([])

  const [resumeMatch, setResumeMatch] = useState<MatchRow | null>(null)
  const [detailMatch, setDetailMatch] = useState<MatchRow | null>(null)

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

      // Suscribirse a cambios en los partidos asignados para reflejar marcador en vivo
      if ((nextMatches ?? []).length > 0) {
        const channel = supabase
          .channel("mesa-matches-live")
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "matches",
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

                  // Preservar datos derivados (assignmentRole, fechas ya parseadas) donde sea posible
                  return {
                    ...m,
                    status: (updated.status as MatchRow["status"]) ?? m.status,
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
    }

    const cleanupPromise = run()

    return () => {
      // En caso de que el efecto se limpie antes de que termine run
      cleanupPromise?.then((cleanup) => {
        if (typeof cleanup === "function") cleanup()
      })
    }
  }, [supabase])

  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (!user) {
        setCanSwitchToArbitros(false)
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_referee, is_table_official")
        .eq("id", user.id)
        .maybeSingle()

      const raw = profile as any
      setCanSwitchToArbitros(Boolean(raw?.is_referee) && Boolean(raw?.is_table_official))
    }

    run()
  }, [supabase])

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "TBD"
  const getTeamLogo = (id: string) => teams.find((t) => t.id === id)?.logoUrl || ""
  const getTournamentName = (id: string) => tournaments.find((t) => t.id === id)?.name || "Torneo"
  const getVenueName = (id?: string | null) => venues.find((v) => v.id === id)?.name || "-"
  const getCourtName = (id?: string | null) => courts.find((c) => c.id === id)?.name || "-"

  const getLiveStateForMatch = (match: MatchRow) => {
    // Si el partido ya está finalizado, usamos siempre el resultado oficial de matches
    if (match.status === "finalizado") {
      return {
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        period: undefined,
        gameTime: undefined,
      }
    }

    // 1) Para partidos no finalizados, preferir estado vivo centralizado en Supabase si está presente
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

    // 2) Si no hay estado vivo en DB, intentar leer desde localStorage (mismo dispositivo)
    if (typeof window !== "undefined") {
      try {
        const key = `planilla-state:${match.id}`
        const raw = window.localStorage.getItem(key)
        if (raw) {
          console.log("[mesa] getLiveStateForMatch: found local state", { matchId: match.id, key })
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

  const handleStartSheet = (match: MatchRow) => {
    // Si el partido ya está en juego, siempre ofrecemos continuar el acta
    console.log("[mesa] handleStartSheet", { matchId: match.id, status: match.status })
    if (match.status === "en_juego") {
      setResumeMatch(match)
      return
    }

    // Si todavía no empezó, vamos al flujo normal de pre-planilla
    router.push(`/mesa/planilla/${match.id}/pre?forcePre=1`)
  }

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
        <div className="container mx-auto flex items-center justify-between p-4 gap-4">
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
          <div className="flex items-center gap-3">
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
            {canSwitchToArbitros && (
              <Button variant="outline" onClick={() => router.push("/arbitros")}>
                Ir a Árbitros
              </Button>
            )}
            <LogoutButton />
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
                    <div className="text-center flex-1 flex flex-col items-center gap-2">
                      {getTeamLogo(match.homeTeamId) ? (
                        <div className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center">
                          <img
                            src={getTeamLogo(match.homeTeamId)}
                            alt={getTeamName(match.homeTeamId)}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-muted">
                          {getTeamName(match.homeTeamId).substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <p className="font-semibold text-lg">{getTeamName(match.homeTeamId)}</p>
                      <p className="text-sm text-muted-foreground">Local</p>
                    </div>
                    <div className="px-4">
                      {match.status !== "programado" ? (
                        (() => {
                          const live = getLiveStateForMatch(match)
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-3 text-3xl font-bold">
                                <span>{live.homeScore}</span>
                                <span className="text-muted-foreground">-</span>
                                <span>{live.awayScore}</span>
                              </div>
                              {match.status === "en_juego" && (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>
                                    Tiempo: <strong>{formatGameClock(live.gameTime)}</strong>
                                  </span>
                                  {typeof live.period === "number" && (
                                    <span>
                                      Cuarto: <strong>{live.period}</strong>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })()
                      ) : (
                        <span className="text-2xl font-bold text-muted-foreground">VS</span>
                      )}
                    </div>
                    <div className="text-center flex-1 flex flex-col items-center gap-2">
                      {getTeamLogo(match.awayTeamId) ? (
                        <div className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center">
                          <img
                            src={getTeamLogo(match.awayTeamId)}
                            alt={getTeamName(match.awayTeamId)}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-muted">
                          {getTeamName(match.awayTeamId).substring(0, 2).toUpperCase()}
                        </div>
                      )}
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
                          {getVenueName(match.venueId)}
                          {match.courtId ? ` - ${getCourtName(match.courtId)}` : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  {match.assignmentRole && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Tu función en este partido: {match.assignmentRole === "arbitro" ? "Árbitro" : "Oficial de Mesa"}
                    </p>
                  )}

                  {/* Action Button */}
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto flex-1"
                      size="lg"
                      onClick={() => setDetailMatch(match)}
                    >
                      Ver detalle
                    </Button>
                    {match.assignmentRole === "oficial_mesa" ? (
                      match.status === "en_juego" ? (
                        <Button className="w-full sm:w-auto flex-1" size="lg" onClick={() => handleStartSheet(match)}>
                          <Play className="mr-2 h-5 w-5" />
                          Iniciar Acta
                        </Button>
                      ) : (
                        <Button className="w-full sm:w-auto flex-1" size="lg" disabled>
                          Esperando que el árbitro inicie el partido
                        </Button>
                      )
                    ) : (
                      <Button className="w-full sm:w-auto flex-1" size="lg" disabled>
                        Tu rol en este partido es de Árbitro
                      </Button>
                    )}
                  </div>
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

      {/* Dialogo para continuar acta iniciada */}
      <Dialog
        open={!!resumeMatch}
        onOpenChange={(open) => {
          if (!open) setResumeMatch(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acta ya iniciada</DialogTitle>
            <DialogDescription>
              Ya existe una planilla digital iniciada para este partido. Podés continuar donde la dejaste o empezar una
              nueva acta desde cero.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!resumeMatch) return
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem(`planilla-state:${resumeMatch.id}`)
                }
                const id = resumeMatch.id
                setResumeMatch(null)
                router.push(`/mesa/planilla/${id}/pre?forcePre=1`)
              }}
            >
              Empezar acta nueva
            </Button>
            <Button
              onClick={async () => {
                if (!resumeMatch) return
                const id = resumeMatch.id

                try {
                  const { data: sessionData } = await supabase.auth.getSession()
                  const token = sessionData.session?.access_token

                  if (token) {
                    const res = await fetch(`/api/mesa/matches/${id}/preplanilla`, {
                      headers: {
                        authorization: `Bearer ${token}`,
                      },
                    })

                    if (res.ok) {
                      const json = await res.json().catch(() => null)
                      if (json && json.homeState && json.awayState && typeof window !== "undefined") {
                        window.localStorage.setItem(
                          `preplanilla:${id}`,
                          JSON.stringify({ home: json.homeState, away: json.awayState }),
                        )
                      }
                    }
                  }
                } catch {
                  // si falla, continuamos igualmente a la planilla con el estado local existente
                }

                setResumeMatch(null)
                router.push(`/mesa/planilla/${id}`)
              }}
            >
              Cargar acta iniciada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogo de detalle de partido */}
      <Dialog
        open={!!detailMatch}
        onOpenChange={(open) => {
          if (!open) setDetailMatch(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle del partido</DialogTitle>
            <DialogDescription>
              Información del partido y tu función asignada.
            </DialogDescription>
          </DialogHeader>
          {detailMatch && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Torneo</p>
                <p className="text-muted-foreground">{getTournamentName(detailMatch.tournamentId)}</p>
              </div>
              <div>
                <p className="font-medium">Equipos</p>
                <p className="text-muted-foreground">
                  {getTeamName(detailMatch.homeTeamId)} vs {getTeamName(detailMatch.awayTeamId)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="font-medium">Fecha</p>
                  <p className="text-muted-foreground">
                    {detailMatch.scheduledDate ? formatDate(detailMatch.scheduledDate) : "Sin fecha"}
                  </p>
                </div>
                <div>
                  <p className="font-medium">Hora</p>
                  <p className="text-muted-foreground">{detailMatch.scheduledTime ?? "-"}</p>
                </div>
              </div>
              <div>
                <p className="font-medium">Sede y cancha</p>
                <p className="text-muted-foreground">
                  {detailMatch.venueId
                    ? `${getVenueName(detailMatch.venueId)} - ${getCourtName(detailMatch.courtId)}`
                    : "Sin sede"}
                </p>
              </div>
              {detailMatch.assignmentRole && (
                <div>
                  <p className="font-medium">Tu función en este partido</p>
                  <p className="text-muted-foreground">
                    {detailMatch.assignmentRole === "arbitro" ? "Árbitro" : "Oficial de Mesa"}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
  assignmentRole?: "arbitro" | "oficial_mesa" | null
  scheduledAt?: Date
  scheduledDate?: Date
  scheduledTime?: string
  venueId?: string | null
  courtId?: string | null
  homeScore?: number | null
  awayScore?: number | null
  liveHomeScore?: number | null
  liveAwayScore?: number | null
  livePeriod?: number | null
  liveGameTime?: number | null
  createdAt: Date
}

type TeamRow = { id: string; name: string; primaryColor: string; logoUrl: string }
type TournamentRow = { id: string; name: string }
type VenueRow = { id: string; name: string }
type CourtRow = { id: string; name: string }

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
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    round: row.round,
    phase: row.phase,
    status: row.status,
    assignmentRole: (row.assignment_role as "arbitro" | "oficial_mesa" | null) ?? null,
    scheduledAt,
    scheduledDate: scheduledAt,
    scheduledTime,
    venueId: row.venue_id ?? null,
    courtId: row.court_id ?? null,
    homeScore: row.home_score ?? null,
    awayScore: row.away_score ?? null,
    liveHomeScore: row.live_home_score ?? null,
    liveAwayScore: row.live_away_score ?? null,
    livePeriod: row.live_period ?? null,
    liveGameTime: row.live_game_time ?? null,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(0),
  }
}
