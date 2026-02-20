"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Calendar, Shuffle, ChevronDown, ChevronUp } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { BadgeStatus } from "@/components/ui/badge-status"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { MatchStatus, TournamentPhase } from "@/lib/types"

export default function FixturePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedTournament, setSelectedTournament] = useState<string>("")
  const [selectedStage, setSelectedStage] = useState<TournamentPhase | "all">("all")
  const [selectedStageRound, setSelectedStageRound] = useState<number | "all">("all")
  const [zonesCount, setZonesCount] = useState<number>(1)
  const [closedGroups, setClosedGroups] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const [
        { data: tournamentsData, error: tournamentsError },
        { data: venuesData, error: venuesError },
        session,
      ] =
        await Promise.all([
          supabase
            .from("tournaments")
            .select("id, name, year, branch, status, created_at, category_id")
            .order("created_at", { ascending: false }),
          supabase.from("venues").select("id, name").order("name", { ascending: true }),
          supabase.auth.getSession(),
        ])

      if (tournamentsError) setError(tournamentsError.message)
      if (venuesError) setError((prev) => prev ?? venuesError.message)

      const nextTournaments = (tournamentsData ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        year: t.year,
        branch: t.branch,
        status: t.status,
        createdAt: t.created_at,
        categoryId: t.category_id,
      })) as Tournament[]
      setTournaments(nextTournaments)

      setVenues(
        (venuesData ?? []).map((v: any) => ({
          id: v.id,
          name: v.name,
        })) as Venue[],
      )

      const initialTournamentId = nextTournaments[0]?.id
      setSelectedTournament((prev) => prev || initialTournamentId || "")

      const token = session.data.session?.access_token
      if (!token) {
        setMatches([])
        setError((prev) => prev ?? "Tenés que iniciar sesión para ver el fixture.")
        setLoading(false)
        return
      }

      setLoading(false)
    }

    run()
  }, [supabase])

  useEffect(() => {
    const run = async () => {
      if (!selectedTournament) return

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return

      const tournament = tournaments.find((t) => t.id === selectedTournament)
      const categoryId = tournament?.categoryId

      setLoading(true)
      setError(null)

      if (!categoryId) {
        setTeams([])
        setMatches([])
        setLoading(false)
        return
      }

      const { data: teamCategoryRows, error: teamCategoryError } = await supabase
        .from("team_categories")
        .select("team_id")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: true })

      if (teamCategoryError) {
        setTeams([])
        setMatches([])
        setError(teamCategoryError.message)
        setLoading(false)
        return
      }

      const teamIds = Array.from(new Set((teamCategoryRows ?? []).map((r: any) => r.team_id).filter(Boolean))) as string[]
      if (teamIds.length === 0) {
        setTeams([])
      } else {
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("id, name, logo_url, primary_color")
          .in("id", teamIds)
          .order("name", { ascending: true })

        if (teamsError) {
          setTeams([])
          setError(teamsError.message)
        } else {
          setTeams(
            (teamsData ?? []).map((t: any) => ({
              id: t.id,
              name: t.name,
              logoUrl: t.logo_url ?? "",
              primaryColor: t.primary_color,
            })) as Team[],
          )
        }
      }

      const res = await fetch(`/api/admin/matches?tournamentId=${encodeURIComponent(selectedTournament)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setMatches([])
        setError(json?.error ?? "No se pudieron cargar los partidos")
      } else {
        setMatches((json.matches ?? []).map(mapMatchFromDb) as MatchRow[])
      }

      setLoading(false)
    }

    run()
  }, [selectedTournament, supabase, tournaments])

  const stageLabel = (phase: TournamentPhase) => {
    if (phase === "fase_regular") return "Fase Regular"
    if (phase === "cuartos") return "Cuartos"
    if (phase === "semifinal") return "Semifinal"
    if (phase === "final") return "Final"
    return "Playoff"
  }

  const stageRoundForMatch = (m: MatchRow) => {
    if (m.phase === "fase_regular") return m.round
    return m.seriesGameNumber ?? 1
  }

  const zoneLabel = (zone?: string | null) => {
    if (!zone) return ""
    return `Zona ${zone}`
  }

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (selectedStage !== "all" && m.phase !== selectedStage) return false
      const r = stageRoundForMatch(m)
      if (selectedStageRound !== "all" && r !== selectedStageRound) return false
      return true
    })
  }, [matches, selectedStage, selectedStageRound])

  const grouped = useMemo(() => {
    const acc = new Map<string, { phase: TournamentPhase; stageRound: number; zoneCode: string | null; matches: MatchRow[] }>()
    for (const m of filteredMatches) {
      const sr = stageRoundForMatch(m)
      const z = m.phase === "fase_regular" ? (m.zoneCode ?? null) : null
      const key = `${m.phase}:${z ?? ""}:${sr}`
      const existing = acc.get(key)
      if (existing) existing.matches.push(m)
      else acc.set(key, { phase: m.phase, stageRound: sr, zoneCode: z, matches: [m] })
    }

    const list = Array.from(acc.values())
    const phaseOrder: Record<TournamentPhase, number> = {
      fase_regular: 0,
      playoff: 1,
      cuartos: 2,
      semifinal: 3,
      final: 4,
    }

    list.sort((a, b) => {
      const pa = phaseOrder[a.phase] ?? 99
      const pb = phaseOrder[b.phase] ?? 99
      if (pa !== pb) return pa - pb
      if (a.phase === "fase_regular" && b.phase === "fase_regular") {
        if (a.stageRound !== b.stageRound) return a.stageRound - b.stageRound
        if ((a.zoneCode ?? "") !== (b.zoneCode ?? "")) return (a.zoneCode ?? "").localeCompare(b.zoneCode ?? "")
        return 0
      }
      return a.stageRound - b.stageRound
    })

    for (const g of list) {
      g.matches.sort((a, b) => {
        const aa = a.scheduledDate?.getTime() ?? 0
        const bb = b.scheduledDate?.getTime() ?? 0
        if (aa !== bb) return aa - bb
        return a.createdAt.getTime() - b.createdAt.getTime()
      })
    }

    return list
  }, [filteredMatches])

  const getByeTeamIdForRound = (round: number, zoneCode: string | null) => {
    const zoneTeams = zoneCode
      ? teams.filter((t) => matches.some((m) => m.phase === "fase_regular" && m.zoneCode === zoneCode && (m.homeTeamId === t.id || m.awayTeamId === t.id)))
      : teams

    if (zoneTeams.length % 2 === 0) return null

    const roundMatches = matches.filter(
      (m) => m.phase === "fase_regular" && m.round === round && (zoneCode ? m.zoneCode === zoneCode : true),
    )
    const used = new Set<string>()
    for (const match of roundMatches) {
      used.add(match.homeTeamId)
      used.add(match.awayTeamId)
    }
    return zoneTeams.find((t) => !used.has(t.id))?.id ?? null
  }

  const availableStages = useMemo(() => {
    const phases = Array.from(new Set(matches.map((m) => m.phase)))
    const order: Record<TournamentPhase, number> = {
      fase_regular: 0,
      playoff: 1,
      cuartos: 2,
      semifinal: 3,
      final: 4,
    }
    return phases.sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99))
  }, [matches])

  const availableStageRounds = useMemo(() => {
    const base = selectedStage === "all" ? matches : matches.filter((m) => m.phase === selectedStage)
    const rounds = Array.from(new Set(base.map((m) => stageRoundForMatch(m))))
    return rounds.sort((a, b) => a - b)
  }, [matches, selectedStage])

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "TBD"
  const getTeamColor = (id: string) => teams.find((t) => t.id === id)?.primaryColor || "#666"
  const getTeamLogo = (id: string) => teams.find((t) => t.id === id)?.logoUrl || ""
  const getVenueName = (id?: string | null) => venues.find((v) => v.id === id)?.name || "-"

  const toggleGroup = (key: string) => {
    setClosedGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const handleGenerateFixture = async () => {
    if (!selectedTournament) return
    setSubmitting(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión para generar el fixture.")
        return
      }

      const res = await fetch("/api/admin/fixture/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tournamentId: selectedTournament, zonesCount }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo generar el fixture")
        return
      }

      setMatches((json.matches ?? []).map(mapMatchFromDb) as MatchRow[])
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (date?: Date) => {
    if (!date) return "Sin programar"
    return new Date(date).toLocaleDateString("es-AR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Fixture" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fixture del Torneo</h1>
          <p className="text-muted-foreground mt-1">Visualiza y genera el fixture de partidos.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedTournament} onValueChange={setSelectedTournament}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Seleccionar torneo" />
            </SelectTrigger>
            <SelectContent>
              {tournaments.map((tournament) => (
                <SelectItem key={tournament.id} value={tournament.id}>
                  {tournament.name}
                  {tournament.year ? ` ${tournament.year}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedStage}
            onValueChange={(v) => {
              setSelectedStage(v as any)
              setSelectedStageRound("all")
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las etapas</SelectItem>
              {availableStages.map((p) => (
                <SelectItem key={p} value={p}>
                  {stageLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStageRound.toString()} onValueChange={(v) => setSelectedStageRound(v === "all" ? "all" : Number(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Fecha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fechas</SelectItem>
              {availableStageRounds.map((r) => (
                <SelectItem key={r} value={r.toString()}>
                  Fecha {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={submitting || teams.length < 2}>
                <Shuffle className="mr-2 h-4 w-4" />
                {submitting ? "Generando..." : "Generar Fixture"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Generar Fixture Automáticamente</AlertDialogTitle>
                <AlertDialogDescription>
                  Esto generará un fixture round-robin para los {teams.length} equipos de la categoría. Si ya
                  existe un fixture, será reemplazado. ¿Deseas continuar?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <div className="text-sm font-medium">Cantidad de zonas</div>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={zonesCount}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setZonesCount(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)
                  }}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleGenerateFixture} disabled={submitting}>
                  {submitting ? "Generando..." : "Generar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {error && <div className="text-red-500">{error}</div>}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando fixture...</CardContent>
        </Card>
      ) : !selectedTournament ? (
        <EmptyState
          icon={Calendar}
          title="Selecciona un torneo"
          description="Elige un torneo para ver su fixture."
        />
      ) : !tournaments.find((t) => t.id === selectedTournament)?.categoryId ? (
        <EmptyState
          icon={Calendar}
          title="No hay categorías"
          description="Este torneo todavía no tiene una categoría creada."
        />
      ) : teams.length < 2 ? (
        <EmptyState
          icon={Calendar}
          title="Equipos insuficientes"
          description="Se necesitan al menos 2 equipos para generar un fixture."
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No hay fixture generado"
          description="Genera el fixture automáticamente para comenzar."
          action={{ label: "Generar Fixture", onClick: handleGenerateFixture }}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => {
            const key = `${group.phase}:${group.zoneCode ?? ""}:${group.stageRound}`
            const isOpen = !closedGroups.includes(key)
            const title =
              group.phase === "fase_regular"
                ? `${group.zoneCode ? `Fecha ${group.stageRound} - ${zoneLabel(group.zoneCode)}` : `Fecha ${group.stageRound}`}`
                : `${stageLabel(group.phase)} - Fecha ${group.stageRound}`
            const byeTeamId = group.phase === "fase_regular" ? getByeTeamIdForRound(group.stageRound, group.zoneCode) : null

            return (
            <Collapsible key={key} open={isOpen} onOpenChange={() => toggleGroup(key)}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>
                          {group.matches.length} partidos
                          {byeTeamId ? " · 1 libre" : ""}
                        </CardDescription>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {group.matches.map((match) => (
                        <div
                          key={match.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border bg-card"
                        >
                          {/* Teams */}
                          <div className="flex items-center gap-4 flex-1">
                            <div className="flex items-center gap-3 flex-1">
                              {getTeamLogo(match.homeTeamId) ? (
                                <div
                                  className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0"
                                  style={{ borderColor: getTeamColor(match.homeTeamId) }}
                                >
                                  <img
                                    src={getTeamLogo(match.homeTeamId)}
                                    alt={getTeamName(match.homeTeamId)}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div
                                  className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                  style={{ backgroundColor: getTeamColor(match.homeTeamId) }}
                                >
                                  {getTeamName(match.homeTeamId).substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <span className="font-medium truncate">{getTeamName(match.homeTeamId)}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {match.status === "finalizado" ? (
                                <div className="flex items-center gap-2 text-2xl font-bold">
                                  <span>{match.homeScore}</span>
                                  <span className="text-muted-foreground">-</span>
                                  <span>{match.awayScore}</span>
                                </div>
                              ) : match.status === "en_juego" ? (
                                <div className="flex items-center gap-2 text-2xl font-bold text-[var(--color-live)]">
                                  <span>{match.homeScore || 0}</span>
                                  <span className="text-muted-foreground">-</span>
                                  <span>{match.awayScore || 0}</span>
                                </div>
                              ) : (
                                <span className="text-lg text-muted-foreground">vs</span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 flex-1 justify-end">
                              <span className="font-medium truncate text-right">{getTeamName(match.awayTeamId)}</span>
                              {getTeamLogo(match.awayTeamId) ? (
                                <div
                                  className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0"
                                  style={{ borderColor: getTeamColor(match.awayTeamId) }}
                                >
                                  <img
                                    src={getTeamLogo(match.awayTeamId)}
                                    alt={getTeamName(match.awayTeamId)}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div
                                  className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                  style={{ backgroundColor: getTeamColor(match.awayTeamId) }}
                                >
                                  {getTeamName(match.awayTeamId).substring(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Date and Status */}
                          <div className="flex items-center gap-4 sm:border-l sm:pl-4">
                            <div className="text-sm text-right">
                              <p className="text-muted-foreground">{formatDate(match.scheduledDate)}</p>
                              <p className="text-muted-foreground">{getVenueName(match.venueId)}</p>
                              {match.scheduledTime && <p className="font-medium">{match.scheduledTime}</p>}
                            </div>
                            <BadgeStatus status={match.status} />
                          </div>
                        </div>
                      ))}
                      {(() => {
                        if (!byeTeamId) return null
                        return (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border bg-muted/30">
                            <div className="flex items-center gap-4 flex-1">
                              <div className="flex items-center gap-3 flex-1">
                                {getTeamLogo(byeTeamId) ? (
                                  <div
                                    className="h-10 w-10 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0"
                                    style={{ borderColor: getTeamColor(byeTeamId) }}
                                  >
                                    <img
                                      src={getTeamLogo(byeTeamId)}
                                      alt={getTeamName(byeTeamId)}
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div
                                    className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                    style={{ backgroundColor: getTeamColor(byeTeamId) }}
                                  >
                                    {getTeamName(byeTeamId).substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{getTeamName(byeTeamId)}</p>
                                  <p className="text-sm text-muted-foreground">Libre</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
            )
          })}
        </div>
      )}
    </div>
  )
}

type Category = {
  id: string
  tournamentId: string
  name: string
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

type Team = {
  id: string
  name: string
  logoUrl?: string
  primaryColor: string
}

type Venue = {
  id: string
  name: string
}

type MatchRow = {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  round: number
  phase: TournamentPhase
  status: MatchStatus
  scheduledDate?: Date
  scheduledTime?: string
  venueId?: string | null
  homeScore?: number
  awayScore?: number
  zoneCode?: string | null
  playoffSeriesId?: string | null
  seriesGameNumber?: number | null
  createdAt: Date
}

function mapMatchFromDb(row: any): MatchRow {
  const scheduledAt = row.scheduled_at ? new Date(row.scheduled_at) : undefined
  const rawScheduled: string | null = row.scheduled_at ?? null
  let scheduledTime: string | undefined
  if (typeof rawScheduled === "string") {
    const match = rawScheduled.match(/T(\d{2}:\d{2})/)
    if (match) scheduledTime = match[1]
  }
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    round: row.round,
    phase: row.phase,
    status: row.status,
    scheduledDate: scheduledAt,
    scheduledTime,
    venueId: row.venue_id ?? null,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    zoneCode: row.zone_code ?? null,
    playoffSeriesId: row.playoff_series_id ?? null,
    seriesGameNumber: row.series_game_number ?? null,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(0),
  }
}
