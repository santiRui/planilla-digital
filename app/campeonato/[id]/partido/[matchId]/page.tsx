"use client"

import { use, useEffect, useMemo, useState } from "react"
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
  homeTeamName: string
  awayTeamName: string
  homeScore: number
  awayScore: number
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
  teamName?: string
  playerName?: string
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
}

function formatEventTitle(ev: UiEvent): string {
  switch (ev.type) {
    case "points":
      // En muchos casos no se usa directamente; lo dejamos genérico
      return "Puntos"
    case "shot":
      return "Tiro de campo"
    case "free_throw":
      return "Tiro libre"
    case "rebound":
      return "Rebote"
    case "assist":
      return "Asistencia"
    case "turnover":
      return "Pérdida"
    case "steal":
      return "Robo"
    case "block":
      return "Tapa"
    case "foul":
      return "Falta"
    case "timeout":
      return "Tiempo muerto"
    case "substitution_in":
    case "substitution_out":
      return "Cambio"
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

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      // Leer datos básicos del partido
      const { data, error: mError } = await supabase
        .from("matches")
        .select(
          "id, tournament_id, round, status, scheduled_at, home_score, away_score, home_team_id, away_team_id",
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
        homeTeamName,
        awayTeamName,
        homeScore: mRow.home_score ?? 0,
        awayScore: mRow.away_score ?? 0,
        homeTeamLogoUrl,
        awayTeamLogoUrl,
        homeTeamPrimaryColor,
        awayTeamPrimaryColor,
      })

      // Leer eventos del partido
      const { data: evRows, error: evError } = await supabase
        .from("match_events")
        .select(
          "id, type, period, game_time, team:teams(name), player:players(first_name, last_name)",
        )
        .eq("match_id", matchId)
        .order("period", { ascending: true })
        .order("game_time", { ascending: false })

      if (evError) {
        setError((prev) => prev ?? evError.message)
        setLoading(false)
        return
      }

      const uiEvents: UiEvent[] = (evRows ?? []).map((e: any) => ({
        id: e.id,
        type: e.type as string,
        period: e.period,
        gameTime: e.game_time as string,
        teamName: e.team?.name as string | undefined,
        playerName:
          e.player?.first_name && e.player?.last_name
            ? `${e.player.last_name}, ${e.player.first_name}`
            : undefined,
      }))

      setEvents(uiEvents)
      setLoading(false)
    }

    void run()
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
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => router.push(`/campeonato/${tournamentId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al campeonato
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            {/* Izquierda: fecha + filas de equipos */}
            <div className="flex-1 space-y-3">
              <p className="text-sm text-primary-foreground/80">
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
                    <p className="text-[11px] uppercase tracking-wide text-primary-foreground/70">Local</p>
                    <p className="text-lg font-semibold leading-tight truncate">
                      {match ? match.homeTeamName : "Equipo local"}
                    </p>
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-bold tabular-nums">
                  {match?.homeScore ?? 0}
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
                    <p className="text-[11px] uppercase tracking-wide text-primary-foreground/70">Visitante</p>
                    <p className="text-lg font-semibold leading-tight truncate">
                      {match ? match.awayTeamName : "Equipo visitante"}
                    </p>
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-bold tabular-nums">
                  {match?.awayScore ?? 0}
                </div>
              </div>
            </div>

            {/* Derecha: resumen marcador/estado */}
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <p className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wide">
                  Marcador actual
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {match?.homeScore ?? 0} - {match?.awayScore ?? 0}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-primary-foreground/80">
                <Clock className="h-4 w-4" />
                <span>
                  {match?.status === "finalizado"
                    ? "Finalizado"
                    : match?.status === "en_juego"
                      ? "En juego"
                      : "Programado"}
                </span>
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
                  events.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {formatEventTitle(ev)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ev.gameTime} · Período {ev.period}
                          {ev.teamName && ` · ${ev.teamName}`}
                          {ev.playerName && ` · ${ev.playerName}`}
                        </p>
                      </div>
                    </div>
                  ))
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