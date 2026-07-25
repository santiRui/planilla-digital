"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Trophy, ArrowRight, Check } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import type { TournamentPhase } from "@/lib/types"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

const phaseConfig: Record<TournamentPhase, { label: string; teamsNeeded: number }> = {
  fase_regular: { label: "Fase Regular", teamsNeeded: 0 },
  playoff: { label: "Playoff (8 equipos)", teamsNeeded: 8 },
  cuartos: { label: "Cuartos de Final", teamsNeeded: 8 },
  semifinal: { label: "Semifinal", teamsNeeded: 4 },
  final: { label: "Final", teamsNeeded: 2 },
}

type PlayoffConfig = {
  qualifiedTeams: 2 | 4 | 8
  bestOfCuartos: number
  bestOfSemifinal: number
  bestOfFinal: number
  tiebreakMode: "olimpico_sorteo" | "olimpico_sin_sorteo" | "labas"
}

export default function FasesPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [teamZones, setTeamZones] = useState<Record<string, string>>({})

  const [selectedTournament, setSelectedTournament] = useState<string>("")
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [playoffConfig, setPlayoffConfig] = useState<PlayoffConfig>({
    qualifiedTeams: 8 as 2 | 4 | 8,
    bestOfCuartos: 1,
    bestOfSemifinal: 1,
    bestOfFinal: 1,
    tiebreakMode: "olimpico_sorteo",
  })
  const [qualifiedTeamsInput, setQualifiedTeamsInput] = useState<string>("8")
  const [bestOfCuartosInput, setBestOfCuartosInput] = useState<string>("1")
  const [bestOfSemifinalInput, setBestOfSemifinalInput] = useState<string>("1")
  const [bestOfFinalInput, setBestOfFinalInput] = useState<string>("1")
  const [hasPlayoffConfig, setHasPlayoffConfig] = useState(false)
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
        session,
      ] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id, name, year, branch, status, created_at, category_id")
          .order("created_at", { ascending: false }),
        supabase.auth.getSession(),
      ])

      if (tournamentsError) setError(tournamentsError.message)

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

      const initialTournamentId = nextTournaments[0]?.id
      setSelectedTournament((prev) => prev || initialTournamentId || "")

      const token = session.data.session?.access_token
      if (!token) {
        setMatches([])
        setTeams([])
        setError((prev) => prev ?? "Tenés que iniciar sesión para ver Fases.")
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
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setMatches([])
        setError(json?.error ?? "No se pudieron cargar los partidos")
      } else {
        setMatches((json.matches ?? []).map(mapMatchFromDb) as MatchRow[])
      }

      const { data: zonesRows, error: zonesError } = await supabase
        .from("tournament_team_zones")
        .select("team_id, zone_code")
        .eq("tournament_id", selectedTournament)

      if (zonesError) {
        setTeamZones({})
      } else {
        const map: Record<string, string> = {}
        for (const r of (zonesRows ?? []) as any[]) {
          if (r?.team_id && r?.zone_code) map[String(r.team_id)] = String(r.zone_code)
        }
        setTeamZones(map)
      }

      // Cargar configuración de playoffs (si existe) para saber cuántos clasifican.
      const configRes = await fetch(
        `/api/admin/playoff/config?tournamentId=${encodeURIComponent(selectedTournament)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      const configJson = (await configRes.json().catch(() => null)) as any
      if (configRes.ok && configJson?.config) {
        const cfg = configJson.config
        setPlayoffConfig((prev) => ({
          ...prev,
          qualifiedTeams: (cfg.qualifiedTeams as 2 | 4 | 8) ?? prev.qualifiedTeams,
          bestOfCuartos: cfg.bestOfCuartos ?? prev.bestOfCuartos,
          bestOfSemifinal: cfg.bestOfSemifinal ?? prev.bestOfSemifinal,
          bestOfFinal: cfg.bestOfFinal ?? prev.bestOfFinal,
          tiebreakMode: (cfg.tiebreakMode as PlayoffConfig["tiebreakMode"]) ?? prev.tiebreakMode,
        }))
        setQualifiedTeamsInput(String(cfg.qualifiedTeams ?? 8))
        setBestOfCuartosInput(String(cfg.bestOfCuartos ?? 1))
        setBestOfSemifinalInput(String(cfg.bestOfSemifinal ?? 1))
        setBestOfFinalInput(String(cfg.bestOfFinal ?? 1))
        setHasPlayoffConfig(true)
      } else {
        setHasPlayoffConfig(false)
      }

      setLoading(false)
    }

    run()
  }, [selectedTournament, supabase, tournaments])

  const categoryMatches = matches
  const categoryTeams = teams

  // Tabla oficial (solo partidos finalizados)
  const categoryStandings = useMemo(() => {
    const regularMatches = categoryMatches.filter((m) => m.phase === "fase_regular")
    return computeStandings(categoryTeams, regularMatches)
  }, [categoryMatches, categoryTeams])

  // Tabla proyectada (incluye partidos en juego con marcador en vivo)
  const categoryStandingsProjected = useMemo(() => {
    const regularMatches = categoryMatches.filter((m) => m.phase === "fase_regular")
    return computeProjectedStandings(categoryTeams, regularMatches)
  }, [categoryMatches, categoryTeams])

  const distinctZones = useMemo(() => {
    const zones = Array.from(new Set(Object.values(teamZones))).filter(Boolean)
    return zones.sort((a, b) => a.localeCompare(b))
  }, [teamZones])

  const standingsByZone = useMemo(() => {
    const out: Array<{ zoneCode: string; standings: StandingRow[] }> = []
    for (const z of distinctZones) {
      const zoneTeams = categoryTeams.filter((t) => teamZones[t.id] === z)
      const zoneMatches = categoryMatches.filter((m) => m.phase === "fase_regular" && (m.zoneCode ?? null) === z)
      out.push({ zoneCode: z, standings: computeProjectedStandings(zoneTeams, zoneMatches) })
    }
    return out
  }, [categoryMatches, categoryTeams, distinctZones, teamZones])

  // Equipos clasificados según la tabla oficial (no proyectada), para generar playoff.
  const qualifiedTeams = useMemo(() => {
    const zonesCount = distinctZones.length
    if (zonesCount >= 2 && playoffConfig.qualifiedTeams % zonesCount === 0) {
      const perZone = playoffConfig.qualifiedTeams / zonesCount
      const topByZone = standingsByZone.map((z) => z.standings.slice(0, perZone))
      const interleaved: StandingRow[] = []

      for (let i = 0; i < perZone; i += 1) {
        for (let zi = 0; zi < topByZone.length; zi += 1) {
          const row = topByZone[zi]?.[i]
          if (row) interleaved.push(row)
        }
      }

      return interleaved
    }

    return categoryStandings.slice(0, playoffConfig.qualifiedTeams)
  }, [categoryStandings, distinctZones.length, playoffConfig.qualifiedTeams, standingsByZone])

  // Determine current phase
  const phases = [...new Set(categoryMatches.map((m) => m.phase))]
  const hasPlayoff = phases.includes("playoff") || phases.includes("cuartos")
  const hasSemifinal = phases.includes("semifinal")
  const hasFinal = phases.includes("final")

  const currentPhase: TournamentPhase = hasFinal
    ? "final"
    : hasSemifinal
      ? "semifinal"
      : hasPlayoff
        ? "cuartos"
        : "fase_regular"

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "TBD"
  const getTeamColor = (id: string) => teams.find((t) => t.id === id)?.primaryColor || "#666"
  const getTeamLogo = (id: string) => teams.find((t) => t.id === id)?.logoUrl || ""

  // Mapa de partidos en juego por equipo (fase regular)
  const liveMatchesByTeam = useMemo(() => {
    const map = new Map<string, MatchRow[]>()
    for (const m of categoryMatches) {
      if (m.phase !== "fase_regular") continue
      if (m.status !== "en_juego") continue
      const ids: string[] = []
      if (m.homeTeamId) ids.push(m.homeTeamId)
      if (m.awayTeamId) ids.push(m.awayTeamId)
      for (const id of ids) {
        const list = map.get(id) ?? []
        list.push(m)
        map.set(id, list)
      }
    }
    return map
  }, [categoryMatches])

  const isQualifiedTeamsValid = useMemo(() => {
    return [2, 4, 8].includes(playoffConfig.qualifiedTeams)
  }, [playoffConfig.qualifiedTeams])

  const isQualifiedTeamsDivisibleByZones = useMemo(() => {
    if (distinctZones.length < 2) return true
    return playoffConfig.qualifiedTeams % distinctZones.length === 0
  }, [distinctZones.length, playoffConfig.qualifiedTeams])

  // Generate playoff matchups para vista previa.
  // Regla: si hay menos equipos clasificados que los cupos configurados (ej. 7 para 8),
  // los primeros quedan libres (bye). En la vista se muestran como "#1 Equipo vs Libre".
  const generateMatchups = () => {
    const matchups: { home: string; away: string | null; isBye?: boolean }[] = []

    if (!qualifiedTeams.length) return matchups

    const expected = playoffConfig.qualifiedTeams
    const total = qualifiedTeams.length

    // Cantidad de "libres": diferencia entre cupos configurados y equipos reales, acotada al total.
    const initialByes = Math.max(0, expected - total)
    const byes = Math.min(initialByes, total)

    // Primero agregamos filas explícitas de libres para los mejores sembrados
    for (let i = 0; i < byes; i++) {
      const team = qualifiedTeams[i]
      if (!team) continue
      matchups.push({ home: team.teamId, away: null, isBye: true })
    }

    // Equipos que efectivamente juegan esta fase (sin los libres de arriba de la tabla)
    const active = qualifiedTeams.slice(byes)
    const half = Math.floor(active.length / 2)

    for (let i = 0; i < half; i++) {
      matchups.push({
        home: active[i]?.teamId || "",
        away: active[active.length - 1 - i]?.teamId || "",
      })
    }

    return matchups
  }

  const matchups = generateMatchups()

  const startPhase = useMemo(() => {
    if (playoffConfig.qualifiedTeams === 8) return "cuartos" as TournamentPhase
    if (playoffConfig.qualifiedTeams === 4) return "semifinal" as TournamentPhase
    return "final" as TournamentPhase
  }, [playoffConfig.qualifiedTeams])

  const handleGeneratePhase = async () => {
    if (!selectedTournament) return

    const qualifiedTeams = Number.parseInt(qualifiedTeamsInput, 10)
    const bestOfCuartos = Number.parseInt(bestOfCuartosInput, 10)
    const bestOfSemifinal = Number.parseInt(bestOfSemifinalInput, 10)
    const bestOfFinal = Number.parseInt(bestOfFinalInput, 10)

    if (!qualifiedTeamsInput.trim() || !Number.isFinite(qualifiedTeams) || ![2, 4, 8].includes(qualifiedTeams)) {
      setError("Faltan datos: completá los equipos que clasifican (solo 2, 4 u 8).")
      return
    }
    if (!bestOfCuartosInput.trim() || !Number.isFinite(bestOfCuartos) || bestOfCuartos < 1 || bestOfCuartos > 9) {
      setError("Faltan datos: completá Cuartos (best-of) entre 1 y 9.")
      return
    }
    if (!bestOfSemifinalInput.trim() || !Number.isFinite(bestOfSemifinal) || bestOfSemifinal < 1 || bestOfSemifinal > 9) {
      setError("Faltan datos: completá Semifinal (best-of) entre 1 y 9.")
      return
    }
    if (!bestOfFinalInput.trim() || !Number.isFinite(bestOfFinal) || bestOfFinal < 1 || bestOfFinal > 9) {
      setError("Faltan datos: completá Final (best-of) entre 1 y 9.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión para generar fases.")
        return
      }

      const saveRes = await fetch(`/api/admin/playoff/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tournamentId: selectedTournament,
          qualifiedTeams,
          bestOfCuartos,
          bestOfSemifinal,
          bestOfFinal,
          tiebreakMode: playoffConfig.tiebreakMode,
        }),
      })

      const saveJson = (await saveRes.json().catch(() => null)) as any
      if (!saveRes.ok) {
        setError(saveJson?.error ?? "No se pudo guardar la configuración")
        return
      }

      const res = await fetch("/api/admin/phases/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tournamentId: selectedTournament,
        }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo generar la fase")
        return
      }

      setShowConfirmDialog(false)

      const refetch = await fetch(`/api/admin/matches?tournamentId=${encodeURIComponent(selectedTournament)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const refetchJson = (await refetch.json().catch(() => null)) as any
      if (refetch.ok) {
        setMatches((refetchJson.matches ?? []).map(mapMatchFromDb) as MatchRow[])
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Fases del Torneo" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fases del Torneo</h1>
          <p className="text-muted-foreground mt-1">Administra las fases y genera los cruces de playoff.</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando fases...</CardContent>
        </Card>
      ) : !selectedTournament ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Selecciona un torneo.</CardContent>
        </Card>
      ) : !tournaments.find((t) => t.id === selectedTournament)?.categoryId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Este torneo no tiene categoría.</CardContent>
        </Card>
      ) : (
        <>
          {/* Phase Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Progreso del Torneo</CardTitle>
              <CardDescription>Fase actual: {phaseConfig[currentPhase].label}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {(["fase_regular", "cuartos", "semifinal", "final"] as TournamentPhase[]).map((phase, index, arr) => (
                  <div key={phase} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          currentPhase === phase
                            ? "bg-primary text-primary-foreground"
                            : phases.includes(phase) || arr.indexOf(currentPhase) > index
                              ? "bg-[var(--color-success)] text-[var(--color-success-foreground)]"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {phases.includes(phase) || arr.indexOf(currentPhase) > index ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <span className="text-sm font-medium">{index + 1}</span>
                        )}
                      </div>
                      <span className="mt-2 text-xs text-center">{phaseConfig[phase].label}</span>
                    </div>
                    {index < arr.length - 1 && <ArrowRight className="h-5 w-5 text-muted-foreground mx-4" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Current Standings */}
            <Card>
              <CardHeader>
                <CardTitle>Tabla de Posiciones</CardTitle>
                <CardDescription>Clasificación actual de la fase regular</CardDescription>
              </CardHeader>
              <CardContent>
                {distinctZones.length >= 2 ? (
                  <div className="space-y-6">
                    {standingsByZone.map((zone) => {
                      const zonesCount = distinctZones.length
                      const perZone = zonesCount > 0 ? playoffConfig.qualifiedTeams / zonesCount : 0
                      const perZoneValid = Number.isFinite(perZone) && Number.isInteger(perZone)

                      return (
                        <div key={zone.zoneCode} className="space-y-2">
                          <div className="text-sm font-medium">Zona {zone.zoneCode}</div>
                          {zone.standings.length === 0 ? (
                            <p className="text-center text-muted-foreground py-2">No hay datos de posiciones</p>
                          ) : (
                            <div className="space-y-2">
                              {zone.standings.map((standing, index) => (
                                <div
                                  key={standing.teamId}
                                  className={`flex items-center justify-between p-3 rounded-lg ${
                                    perZoneValid && index < perZone
                                      ? "bg-[var(--color-success)]/10 border border-[var(--color-success)]/20"
                                      : "bg-muted/50"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 text-center font-bold text-lg">{index + 1}</span>
                                    {getTeamLogo(standing.teamId) ? (
                                      <div
                                        className="h-8 w-8 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0"
                                        style={{ borderColor: getTeamColor(standing.teamId) }}
                                      >
                                        <img
                                          src={getTeamLogo(standing.teamId)}
                                          alt={getTeamName(standing.teamId)}
                                          className="h-full w-full object-cover"
                                        />
                                      </div>
                                    ) : (
                                      <div
                                        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                        style={{ backgroundColor: getTeamColor(standing.teamId) }}
                                      >
                                        {getTeamName(standing.teamId).substring(0, 2).toUpperCase()}
                                      </div>
                                    )}
                                    <span className="font-medium">{getTeamName(standing.teamId)}</span>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="text-muted-foreground">
                                      {standing.won}G - {standing.lost}P
                                    </span>
                                    <span className="font-bold">{standing.points} pts</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {!isQualifiedTeamsDivisibleByZones && (
                      <p className="text-xs text-destructive">
                        Para clasificar por zonas, el número de equipos que clasifican debe ser divisible por la cantidad de zonas.
                      </p>
                    )}
                  </div>
                ) : categoryStandingsProjected.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No hay datos de posiciones</p>
                ) : (
                  <div className="space-y-2">
                    {/* Encabezado de columnas */}
                    <div className="flex justify-end pr-1">
                      <div className="grid grid-cols-9 gap-2 min-w-[320px] sm:min-w-[400px] text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wide text-center">
                        <span>PJ</span>
                        <span>G</span>
                        <span>P</span>
                        <span>NP</span>
                        <span>Pts</span>
                        <span>Pts+</span>
                        <span>Pts-</span>
                        <span>Dif</span>
                        <span>Prom</span>
                      </div>
                    </div>
                    {categoryStandingsProjected.map((standing, index) => {
                      const diff = standing.pointsFor - standing.pointsAgainst
                      const avg = standing.played > 0 ? (standing.pointsFor / standing.played).toFixed(1) : "0.0"
                      const live = liveMatchesByTeam.get(standing.teamId)?.[0]
                      const isLive = !!live
                      const liveHome =
                        typeof live?.liveHomeScore === "number" && live.liveHomeScore >= 0
                          ? live.liveHomeScore
                          : live?.homeScore ?? null
                      const liveAway =
                        typeof live?.liveAwayScore === "number" && live.liveAwayScore >= 0
                          ? live.liveAwayScore
                          : live?.awayScore ?? null
                      return (
                        <div
                          key={standing.teamId}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            hasPlayoffConfig && index < playoffConfig.qualifiedTeams
                              ? "bg-[var(--color-success)]/10 border border-[var(--color-success)]/20"
                              : "bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 text-center font-bold text-lg">{index + 1}</span>
                            {getTeamLogo(standing.teamId) ? (
                              <div
                                className="h-8 w-8 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0"
                                style={{ borderColor: getTeamColor(standing.teamId) }}
                              >
                                <img
                                  src={getTeamLogo(standing.teamId)}
                                  alt={getTeamName(standing.teamId)}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div
                                className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: getTeamColor(standing.teamId) }}
                              >
                                {getTeamName(standing.teamId).substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium">{getTeamName(standing.teamId)}</span>
                              {isLive && live && liveHome != null && liveAway != null && (
                                <span className="text-[11px] text-[var(--color-success)] font-medium">
                                  En juego: {getTeamName(live.homeTeamId)} {liveHome} - {liveAway} {getTeamName(live.awayTeamId)}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Valores alineados bajo el encabezado */}
                          <div className="flex justify-end pr-1">
                            <div className="grid grid-cols-9 gap-2 min-w-[320px] sm:min-w-[400px] text-xs sm:text-sm text-foreground text-center">
                              <span>{standing.played}</span>
                              <span>{standing.won}</span>
                              <span>{standing.lost}</span>
                              <span>{standing.np}</span>
                              <span>{standing.points}</span>
                              <span>{standing.pointsFor}</span>
                              <span>{standing.pointsAgainst}</span>
                              <span>{diff > 0 ? `+${diff}` : diff}</span>
                              <span>{avg}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generate Phase */}
            <Card>
              <CardHeader>
                <CardTitle>Generar Siguiente Fase</CardTitle>
                <CardDescription>Configura y genera los cruces de playoff</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Equipos que clasifican</Label>
                    <Input
                      type="number"
                      min={2}
                      max={32}
                      value={qualifiedTeamsInput}
                      onChange={(e) => {
                        const next = e.target.value
                        setQualifiedTeamsInput(next)
                        const n = Number.parseInt(next, 10)
                        if (Number.isFinite(n) && [2, 4, 8].includes(n)) {
                          setPlayoffConfig((prev) => ({
                            ...prev,
                            qualifiedTeams: n as 2 | 4 | 8,
                          }))
                        }
                      }}
                    />
                    {!isQualifiedTeamsValid && (
                      <p className="text-xs text-destructive">Solo se permiten 2, 4 u 8 equipos.</p>
                    )}
                    <p className="text-xs text-muted-foreground">Instancia inicial: {phaseConfig[startPhase].label}</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Cuartos (best-of)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={9}
                        value={bestOfCuartosInput}
                        onChange={(e) => {
                          const next = e.target.value
                          setBestOfCuartosInput(next)
                          const n = Number.parseInt(next, 10)
                          if (Number.isFinite(n) && n >= 1 && n <= 9) {
                            setPlayoffConfig((prev) => ({
                              ...prev,
                              bestOfCuartos: n,
                            }))
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Semifinal (best-of)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={9}
                        value={bestOfSemifinalInput}
                        onChange={(e) => {
                          const next = e.target.value
                          setBestOfSemifinalInput(next)
                          const n = Number.parseInt(next, 10)
                          if (Number.isFinite(n) && n >= 1 && n <= 9) {
                            setPlayoffConfig((prev) => ({
                              ...prev,
                              bestOfSemifinal: n,
                            }))
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Final (best-of)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={9}
                        value={bestOfFinalInput}
                        onChange={(e) => {
                          const next = e.target.value
                          setBestOfFinalInput(next)
                          const n = Number.parseInt(next, 10)
                          if (Number.isFinite(n) && n >= 1 && n <= 9) {
                            setPlayoffConfig((prev) => ({
                              ...prev,
                              bestOfFinal: n,
                            }))
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Sistema de desempate</Label>
                    <Select
                      value={playoffConfig.tiebreakMode}
                      onValueChange={(v) =>
                        setPlayoffConfig((prev) => ({
                          ...prev,
                          tiebreakMode: v as PlayoffConfig["tiebreakMode"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="olimpico_sorteo">Olímpico (con sorteo)</SelectItem>
                        <SelectItem value="olimpico_sin_sorteo">Olímpico (sin sorteo, por tabla)</SelectItem>
                        <SelectItem value="labas">LaBaS (por tabla)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-2">
                  <Label>Vista Previa de Cruces</Label>
                  <div className="space-y-2">
                    {matchups.map((matchup, index) => {
                      const homeSeed = qualifiedTeams.findIndex((t) => t.teamId === matchup.home) + 1
                      const awaySeed =
                        matchup.away != null
                          ? qualifiedTeams.findIndex((t) => t.teamId === matchup.away) + 1
                          : null

                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">#{homeSeed || "-"}</span>
                            {getTeamLogo(matchup.home) ? (
                              <div
                                className="h-6 w-6 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0"
                                style={{ borderColor: getTeamColor(matchup.home) }}
                              >
                                <img
                                  src={getTeamLogo(matchup.home)}
                                  alt={getTeamName(matchup.home)}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div
                                className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                style={{ backgroundColor: getTeamColor(matchup.home) }}
                              >
                                {getTeamName(matchup.home).substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium">{getTeamName(matchup.home)}</span>
                          </div>
                          <span className="text-muted-foreground">vs</span>
                          <div className="flex items-center gap-2">
                            {matchup.isBye || matchup.away == null ? (
                              <>
                                <span className="font-medium">Libre</span>
                                <span className="text-xs text-muted-foreground">(pasa directo)</span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium">{getTeamName(matchup.away)}</span>
                                {getTeamLogo(matchup.away) ? (
                                  <div
                                    className="h-6 w-6 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0"
                                    style={{ borderColor: getTeamColor(matchup.away) }}
                                  >
                                    <img
                                      src={getTeamLogo(matchup.away)}
                                      alt={getTeamName(matchup.away)}
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div
                                    className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                    style={{ backgroundColor: getTeamColor(matchup.away)} }
                                  >
                                    {getTeamName(matchup.away).substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <span className="text-xs text-muted-foreground">#{awaySeed || "-"}</span>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={qualifiedTeams.length < 2 || !isQualifiedTeamsValid || !isQualifiedTeamsDivisibleByZones}
                >
                  <Trophy className="mr-2 h-4 w-4" />
                  Generar {phaseConfig[startPhase].label}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Confirm Dialog */}
          <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Generación de Fase</AlertDialogTitle>
                <AlertDialogDescription>
                  Se generarán {matchups.length} series para {phaseConfig[startPhase].label}.
                  Esta acción creará los cruces según la tabla de posiciones actual. ¿Deseas continuar?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleGeneratePhase} disabled={submitting}>
                  {submitting ? "Generando..." : "Confirmar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
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

type Team = {
  id: string
  name: string
  logoUrl?: string
  primaryColor: string
}

type MatchRow = {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  round: number
  phase: TournamentPhase
  status: "programado" | "en_juego" | "finalizado"
  homeScore?: number
  awayScore?: number
  liveHomeScore?: number | null
  liveAwayScore?: number | null
  livePeriod?: number | null
  liveGameTime?: string | null
  zoneCode?: string | null
  statusReason?: string | null
}

type StandingRow = {
  teamId: string
  played: number
  won: number
  lost: number
  np: number
  pointsFor: number
  pointsAgainst: number
  points: number
}

function mapMatchFromDb(row: any): MatchRow {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    round: row.round,
    phase: row.phase,
    status: row.status,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    liveHomeScore: row.live_home_score ?? null,
    liveAwayScore: row.live_away_score ?? null,
    livePeriod: row.live_period ?? null,
    liveGameTime: row.live_game_time ?? null,
    zoneCode: row.zone_code ?? null,
    statusReason: row.status_reason ?? null,
  }
}

function computeStandings(teams: Team[], matches: MatchRow[]): StandingRow[] {
  const rows = new Map<string, StandingRow>()

  for (const team of teams) {
    rows.set(team.id, {
      teamId: team.id,
      played: 0,
      won: 0,
      lost: 0,
      np: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      points: 0,
    })
  }

  for (const match of matches) {
    if (match.status !== "finalizado") continue
    if (match.homeScore == null || match.awayScore == null) continue
    if (!rows.has(match.homeTeamId) || !rows.has(match.awayTeamId)) continue

    const home = rows.get(match.homeTeamId)!
    const away = rows.get(match.awayTeamId)!

    home.played += 1
    away.played += 1

    home.pointsFor += match.homeScore
    home.pointsAgainst += match.awayScore

    away.pointsFor += match.awayScore
    away.pointsAgainst += match.homeScore

    const reason = (match.statusReason ?? "").toString()
    const isNoShow = reason.startsWith("no_presentacion:")
    const absent = isNoShow ? (reason.split(":")[1] as "home" | "away" | undefined) : undefined

    const homeAbsent = isNoShow && absent === "home"
    const awayAbsent = isNoShow && absent === "away"

    if (match.homeScore > match.awayScore) {
      home.won += 1
      home.points += 2
      if (awayAbsent) {
        away.np += 1
      } else {
        away.lost += 1
        away.points += 1
      }
    } else {
      away.won += 1
      away.points += 2
      if (homeAbsent) {
        home.np += 1
      } else {
        home.lost += 1
        home.points += 1
      }
    }
  }

  const list = Array.from(rows.values())

  // Helper: diferencia de puntos en enfrentamientos directos entre dos equipos
  const headToHeadDiff = (teamA: string, teamB: string) => {
    let diffA = 0
    let games = 0
    for (const m of matches) {
      if (m.phase !== "fase_regular") continue
      if (m.status !== "finalizado") continue
      const involvesA = m.homeTeamId === teamA || m.awayTeamId === teamA
      const involvesB = m.homeTeamId === teamB || m.awayTeamId === teamB
      if (!involvesA || !involvesB) continue

      const aIsHome = m.homeTeamId === teamA
      const homeScore = m.homeScore ?? 0
      const awayScore = m.awayScore ?? 0
      const aScore = aIsHome ? homeScore : awayScore
      const bScore = aIsHome ? awayScore : homeScore

      diffA += aScore - bScore
      games += 1
    }
    return { diffA, games }
  }

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points

    // Regla NP: el que no tiene NP va arriba si el otro sí tiene.
    const aHasNp = a.np > 0
    const bHasNp = b.np > 0
    if (aHasNp !== bHasNp) {
      return aHasNp ? 1 : -1
    }

    // Confrontación mutua como siguiente criterio
    const { diffA, games } = headToHeadDiff(a.teamId, b.teamId)
    if (games > 0 && diffA !== 0) {
      return diffA > 0 ? -1 : 1
    }

    // Si siguen empatados, diferencia general y luego puntos a favor
    const aDiff = a.pointsFor - a.pointsAgainst
    const bDiff = b.pointsFor - b.pointsAgainst
    if (bDiff !== aDiff) return bDiff - aDiff
    return b.pointsFor - a.pointsFor
  })

  return list
}

// Versión proyectada de la tabla de posiciones que incorpora partidos en juego usando
// el marcador en vivo. Parte de la tabla "oficial" (solo partidos finalizados) y
// le suma, de forma provisoria, lo que estaría pasando si los partidos en juego
// terminaran con el resultado actual.
function computeProjectedStandings(teams: Team[], matches: MatchRow[]): StandingRow[] {
  const base = computeStandings(teams, matches)
  const rows = new Map<string, StandingRow>()
  for (const r of base) {
    rows.set(r.teamId, { ...r })
  }

  for (const m of matches) {
    if (m.phase !== "fase_regular") continue
    if (m.status !== "en_juego") continue
    if (!rows.has(m.homeTeamId) || !rows.has(m.awayTeamId)) continue

    const home = rows.get(m.homeTeamId)!
    const away = rows.get(m.awayTeamId)!

    const homeScore =
      typeof m.liveHomeScore === "number" && m.liveHomeScore >= 0 ? m.liveHomeScore : m.homeScore ?? 0
    const awayScore =
      typeof m.liveAwayScore === "number" && m.liveAwayScore >= 0 ? m.liveAwayScore : m.awayScore ?? 0

    // Si todavía no hay puntos en vivo ni finales, no impacta la proyección.
    if (homeScore === 0 && awayScore === 0 && m.homeScore == null && m.awayScore == null) continue

    home.played += 1
    away.played += 1

    home.pointsFor += homeScore
    home.pointsAgainst += awayScore

    away.pointsFor += awayScore
    away.pointsAgainst += homeScore

    if (homeScore > awayScore) {
      home.won += 1
      away.lost += 1
      home.points += 2
      away.points += 1
    } else if (awayScore > homeScore) {
      away.won += 1
      home.lost += 1
      away.points += 2
      home.points += 1
    }
  }

  const list = Array.from(rows.values())

  const headToHeadDiff = (teamA: string, teamB: string) => {
    let diffA = 0
    let games = 0
    for (const m of matches) {
      if (m.phase !== "fase_regular") continue
      if (m.status !== "finalizado" && m.status !== "en_juego") continue
      const involvesA = m.homeTeamId === teamA || m.awayTeamId === teamA
      const involvesB = m.homeTeamId === teamB || m.awayTeamId === teamB
      if (!involvesA || !involvesB) continue

      const aIsHome = m.homeTeamId === teamA
      const homeScore =
        typeof m.liveHomeScore === "number" && m.liveHomeScore >= 0 ? m.liveHomeScore : m.homeScore ?? 0
      const awayScore =
        typeof m.liveAwayScore === "number" && m.liveAwayScore >= 0 ? m.liveAwayScore : m.awayScore ?? 0
      const aScore = aIsHome ? homeScore : awayScore
      const bScore = aIsHome ? awayScore : homeScore

      diffA += aScore - bScore
      games += 1
    }
    return { diffA, games }
  }

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points

    const aHasNp = a.np > 0
    const bHasNp = b.np > 0
    if (aHasNp !== bHasNp) {
      return aHasNp ? 1 : -1
    }

    const { diffA, games } = headToHeadDiff(a.teamId, b.teamId)
    if (games > 0 && diffA !== 0) {
      return diffA > 0 ? -1 : 1
    }

    const aDiff = a.pointsFor - a.pointsAgainst
    const bDiff = b.pointsFor - b.pointsAgainst
    if (bDiff !== aDiff) return bDiff - aDiff
    return b.pointsFor - a.pointsFor
  })

  return list
}
