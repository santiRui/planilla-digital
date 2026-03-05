"use client"

import { useEffect, useMemo, useState, type ChangeEvent } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { Player } from "@/lib/types"
import { ArrowLeft, CheckCircle2, Circle, Play } from "lucide-react"

type Side = "home" | "away"

type StaffRole = "tecnico" | "asistente"

type StaffRow = {
  id: string
  teamId: string
  firstName: string
  lastName: string
  role: StaffRole
}

type TeamInfo = {
  id: string
  name: string
  primaryColor: string
}

type PrePlanillaTeamState = {
  staffIds: string[]
  selectedPlayerIds: string[]
  jerseyByPlayerId: Record<string, number>
  starters: string[]
  captainId: string | null
  confirmed: boolean
}

type PrePlanillaState = {
  home: PrePlanillaTeamState
  away: PrePlanillaTeamState
}

type DbMatchRow = {
  id: string
  home_team_id: string
  away_team_id: string
  status: "programado" | "en_juego" | "finalizado" | "suspendido" | "demorado"
}

type DbTeamRow = {
  id: string
  name: string
  primary_color: string
}

const emptyTeamState = (): PrePlanillaTeamState => ({
  staffIds: [],
  selectedPlayerIds: [],
  jerseyByPlayerId: {},
  starters: [],
  captainId: null,
  confirmed: false,
})

const defaultState = (): PrePlanillaState => ({
  home: emptyTeamState(),
  away: emptyTeamState(),
})

export default function PrePlanillaPage() {
  const params = useParams()
  const router = useRouter()
  const matchId = params.id as string

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [profileRole, setProfileRole] = useState<"admin" | "arbitro" | "oficial_mesa" | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [match, setMatch] = useState<DbMatchRow | null>(null)
  const [homeTeam, setHomeTeam] = useState<TeamInfo | null>(null)
  const [awayTeam, setAwayTeam] = useState<TeamInfo | null>(null)
  const [homePlayers, setHomePlayers] = useState<Player[]>([])
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([])
  const [staffByTeamId, setStaffByTeamId] = useState<Record<string, StaffRow[]>>({})

  const [step, setStep] = useState<"teams" | "roster" | "starters">("teams")
  const [activeSide, setActiveSide] = useState<Side>("home")

  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false)
  const [noShowAbsentSide, setNoShowAbsentSide] = useState<Side>("home")
  const [noShowSubmitting, setNoShowSubmitting] = useState(false)
  const [noShowError, setNoShowError] = useState<string | null>(null)

  const [state, setState] = useState<PrePlanillaState>(() => {
    if (typeof window === "undefined") return defaultState()
    const raw = window.localStorage.getItem(`preplanilla:${matchId}`)
    if (!raw) return defaultState()
    try {
      const parsed = JSON.parse(raw)

      const migrateTeam = (team: any): PrePlanillaTeamState => {
        const migrated: any = { ...team }
        if (Array.isArray(migrated.staffIds)) {
          // ok
        } else if (typeof migrated.staffId === "string" && migrated.staffId.length > 0) {
          migrated.staffIds = [migrated.staffId]
        } else {
          migrated.staffIds = []
        }
        delete migrated.staffId

        return { ...emptyTeamState(), ...migrated } satisfies PrePlanillaTeamState
      }

      return {
        home: migrateTeam(parsed.home ?? {}),
        away: migrateTeam(parsed.away ?? {}),
      } satisfies PrePlanillaState
    } catch {
      return defaultState()
    }
  })

  const finalizeNoShow = async () => {
    setNoShowError(null)
    setNoShowSubmitting(true)

    const homeScore = noShowAbsentSide === "home" ? 0 : 20
    const awayScore = noShowAbsentSide === "away" ? 0 : 20

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setNoShowError("No autorizado")
        setNoShowSubmitting(false)
        return
      }

      const res = await fetch(`/api/mesa/matches/${matchId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "finalizado",
          homeScore,
          awayScore,
          statusReason: `no_presentacion:${noShowAbsentSide}`,
        }),
      })

      if (!res.ok) {
        setNoShowError("No se pudo finalizar el partido")
        setNoShowSubmitting(false)
        return
      }

      setNoShowDialogOpen(false)
      router.push("/mesa")
    } catch {
      setNoShowError("No se pudo finalizar el partido")
    } finally {
      setNoShowSubmitting(false)
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(`preplanilla:${matchId}`, JSON.stringify(state))
  }, [state, matchId])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data: matchRow, error: matchError } = await supabase
        .from("matches")
        .select("id, home_team_id, away_team_id, status")
        .eq("id", matchId)
        .maybeSingle()

      if (matchError || !matchRow) {
        setError(matchError?.message ?? "Partido no encontrado")
        setLoading(false)
        return
      }

      const dbMatch = matchRow as any
      const mappedMatch: DbMatchRow = {
        id: dbMatch.id,
        home_team_id: dbMatch.home_team_id,
        away_team_id: dbMatch.away_team_id,
        status: dbMatch.status,
      }
      setMatch(mappedMatch)

      const [teamsRes, playersRes, staffRes] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, primary_color")
          .in("id", [mappedMatch.home_team_id, mappedMatch.away_team_id]),
        supabase
          .from("players")
          .select("id, team_id, first_name, last_name, jersey_number, is_federated, photo_url")
          .in("team_id", [mappedMatch.home_team_id, mappedMatch.away_team_id]),
        supabase
          .from("coaching_staff")
          .select("id, team_id, first_name, last_name, role")
          .in("team_id", [mappedMatch.home_team_id, mappedMatch.away_team_id])
          .in("role", ["tecnico", "asistente"]),
      ])

      if (teamsRes.error) setError((prev: string | null) => prev ?? teamsRes.error.message)
      if (playersRes.error) setError((prev: string | null) => prev ?? playersRes.error.message)

      const teams = (teamsRes.data ?? []) as any[]
      const homeDbTeam = teams.find((t) => t.id === mappedMatch.home_team_id)
      const awayDbTeam = teams.find((t) => t.id === mappedMatch.away_team_id)

      setHomeTeam(
        homeDbTeam
          ? { id: homeDbTeam.id, name: homeDbTeam.name, primaryColor: homeDbTeam.primary_color ?? "#666" }
          : null,
      )
      setAwayTeam(
        awayDbTeam
          ? { id: awayDbTeam.id, name: awayDbTeam.name, primaryColor: awayDbTeam.primary_color ?? "#666" }
          : null,
      )

      const allPlayers = (playersRes.data ?? []).map((p: any) => {
        const mapped: Player = {
          id: p.id,
          teamId: p.team_id,
          firstName: p.first_name,
          lastName: p.last_name,
          dni: "",
          birthDate: new Date(),
          jerseyNumber: p.jersey_number,
          height: undefined,
          isFederated: Boolean(p.is_federated),
          photoUrl: p.photo_url ?? undefined,
        }
        return mapped
      })

      const home = allPlayers.filter((p: Player) => p.teamId === mappedMatch.home_team_id)
      const away = allPlayers.filter((p: Player) => p.teamId === mappedMatch.away_team_id)
      setHomePlayers(home)
      setAwayPlayers(away)

      const grouped: Record<string, StaffRow[]> = {}
      const staffRows = (staffRes.data ?? []) as any[]
      staffRows.forEach((r) => {
        const row: StaffRow = {
          id: r.id,
          teamId: r.team_id,
          firstName: r.first_name,
          lastName: r.last_name,
          role: r.role,
        }
        grouped[row.teamId] = grouped[row.teamId] ? [...grouped[row.teamId], row] : [row]
      })
      setStaffByTeamId(grouped)

      setLoading(false)
    }

    run()
  }, [supabase, matchId])

  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      const user = session?.user
      if (!user) {
        setProfileRole(null)
        return
      }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      const rawProfile = profile as any
      const role = rawProfile?.role ?? null
      if (role === "admin" || role === "arbitro" || role === "oficial_mesa") {
        setProfileRole(role)
      } else {
        setProfileRole(null)
      }
    }

    run()
  }, [supabase])

  useEffect(() => {
    if (!match) return
    if (match.status === "en_juego" && profileRole === "arbitro") {
      router.replace(`/mesa/planilla/${matchId}`)
      return
    }
    if (match.status === "finalizado") {
      router.replace("/mesa")
    }
  }, [match, matchId, profileRole, router])

  const teamForSide = (side: Side) => (side === "home" ? homeTeam : awayTeam)
  const playersForSide = (side: Side) => (side === "home" ? homePlayers : awayPlayers)

  const activeTeam = teamForSide(activeSide)
  const activePlayers = playersForSide(activeSide)
  const activeState = state[activeSide]

  const bothConfirmed = state.home.confirmed && state.away.confirmed

  const getJersey = (player: Player, teamState: PrePlanillaTeamState) => {
    const override = teamState.jerseyByPlayerId[player.id]
    if (override !== undefined && override !== null) return override
    return player.jerseyNumber
  }

  const selectedPlayers = useMemo(() => {
    const ids = new Set(activeState.selectedPlayerIds)
    return activePlayers
      .filter((p: Player) => ids.has(p.id))
      .map((p: Player) => ({ player: p, jersey: getJersey(p, activeState) }))
      .sort(
        (a: { player: Player; jersey: number }, b: { player: Player; jersey: number }) => a.jersey - b.jersey,
      )
  }, [activePlayers, activeState])

  const staffOptions = useMemo(() => {
    if (!activeTeam) return []
    return staffByTeamId[activeTeam.id] ?? []
  }, [staffByTeamId, activeTeam])

  const toggleStaffSelected = (staffId: string) => {
    setState((prev: PrePlanillaState) => {
      const cur = prev[activeSide]
      const exists = cur.staffIds.includes(staffId)
      if (exists) {
        return {
          ...prev,
          [activeSide]: {
            ...cur,
            staffIds: cur.staffIds.filter((id: string) => id !== staffId),
          },
        }
      }

      if (cur.staffIds.length >= 2) return prev

      return {
        ...prev,
        [activeSide]: {
          ...cur,
          staffIds: [...cur.staffIds, staffId],
        },
      }
    })
  }

  const [jerseyDialogOpen, setJerseyDialogOpen] = useState(false)
  const [jerseyDialogPlayer, setJerseyDialogPlayer] = useState<Player | null>(null)
  const [jerseyDialogValue, setJerseyDialogValue] = useState("")
  const [jerseyDialogError, setJerseyDialogError] = useState<string | null>(null)

  const openJerseyDialog = (player: Player) => {
    setJerseyDialogPlayer(player)
    setJerseyDialogValue(String(getJersey(player, activeState)))
    setJerseyDialogError(null)
    setJerseyDialogOpen(true)
  }

  const commitJerseyChange = async () => {
    if (!jerseyDialogPlayer) return
    const raw = jerseyDialogValue.trim()
    const next = Number(raw)

    if (!raw || Number.isNaN(next) || next < 0) {
      setJerseyDialogError("Número inválido")
      return
    }

    const selectedIds = new Set(activeState.selectedPlayerIds)
    const duplicates = activePlayers
      .filter((p: Player) => selectedIds.has(p.id) && p.id !== jerseyDialogPlayer.id)
      .some((p: Player) => getJersey(p, activeState) === next)

    if (duplicates) {
      setJerseyDialogError("Ya hay un jugador seleccionado con ese dorsal")
      return
    }

    setState((prev: PrePlanillaState) => ({
      ...prev,
      [activeSide]: {
        ...prev[activeSide],
        jerseyByPlayerId: {
          ...prev[activeSide].jerseyByPlayerId,
          [jerseyDialogPlayer.id]: next,
        },
      },
    }))

    try {
      await (supabase as any)
        .from("players")
        .update({ jersey_number: next })
        .eq("id", jerseyDialogPlayer.id)
    } catch {
      // Si falla la persistencia en BD, mantenemos el cambio local
    }

    setJerseyDialogOpen(false)
    setJerseyDialogPlayer(null)
  }

  const togglePlayerSelected = (playerId: string) => {
    setState((prev: PrePlanillaState) => {
      const cur = prev[activeSide]
      const exists = cur.selectedPlayerIds.includes(playerId)

      if (exists) {
        const nextSelected = cur.selectedPlayerIds.filter((id: string) => id !== playerId)
        const nextStarters = cur.starters.filter((id: string) => id !== playerId)
        const nextCaptainId = cur.captainId === playerId ? null : cur.captainId
        return {
          ...prev,
          [activeSide]: {
            ...cur,
            selectedPlayerIds: nextSelected,
            starters: nextStarters,
            captainId: nextCaptainId,
          },
        }
      }

      if (cur.selectedPlayerIds.length >= 12) return prev

      const player = activePlayers.find((p: Player) => p.id === playerId)
      if (!player) return prev
      const jersey = getJersey(player, cur)

      const duplicates = cur.selectedPlayerIds
        .map((id: string) => activePlayers.find((p: Player) => p.id === id))
        .filter(Boolean)
        .some((p: Player | undefined) => p && getJersey(p, cur) === jersey)

      if (duplicates) return prev

      return {
        ...prev,
        [activeSide]: {
          ...cur,
          selectedPlayerIds: [...cur.selectedPlayerIds, playerId],
        },
      }
    })
  }

  const canSelectPlayer = (player: Player) => {
    const selected = activeState.selectedPlayerIds.includes(player.id)
    if (selected) return true
    if (activeState.selectedPlayerIds.length >= 12) return false

    const jersey = getJersey(player, activeState)
    const selectedIds = new Set(activeState.selectedPlayerIds)
    const duplicate = activePlayers
      .filter((p: Player) => selectedIds.has(p.id))
      .some((p: Player) => getJersey(p, activeState) === jersey)

    return !duplicate
  }

  const toggleStarter = (playerId: string) => {
    setState((prev: PrePlanillaState) => {
      const cur = prev[activeSide]
      if (!cur.selectedPlayerIds.includes(playerId)) return prev
      const exists = cur.starters.includes(playerId)
      const nextStarters = exists
        ? cur.starters.filter((id: string) => id !== playerId)
        : [...cur.starters, playerId]
      const nextCaptainId = exists && cur.captainId === playerId ? null : cur.captainId
      return { ...prev, [activeSide]: { ...cur, starters: nextStarters, captainId: nextCaptainId } }
    })
  }

  const setCaptain = (playerId: string) => {
    setState((prev: PrePlanillaState) => {
      const cur = prev[activeSide]
      if (!cur.selectedPlayerIds.includes(playerId)) return prev
      const nextStarters = cur.starters.includes(playerId) ? cur.starters : [...cur.starters, playerId]
      return { ...prev, [activeSide]: { ...cur, starters: nextStarters, captainId: playerId } }
    })
  }

  const canContinueRoster = () => {
    if (!activeTeam) return false
    if (activeState.selectedPlayerIds.length < 3) return false

    const selectedIds = new Set(activeState.selectedPlayerIds)
    const jerseys = activePlayers
      .filter((p: Player) => selectedIds.has(p.id))
      .map((p: Player) => getJersey(p, activeState))

    return new Set(jerseys).size === jerseys.length
  }

  const canContinueStarters = () => {
    if (activeState.starters.length < 3) return false
    if (!activeState.captainId) return false
    if (!activeState.starters.includes(activeState.captainId)) return false
    return true
  }

  const otherSide: Side = activeSide === "home" ? "away" : "home"

  const nextActionLabel = (() => {
    if (!activeTeam) return ""
    if (activeSide === "home") return "Confirmar visitante"
    return "Confirmar local"
  })()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  if ((match?.status === "en_juego" && profileRole === "arbitro") || match?.status === "finalizado") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Redirigiendo...</p>
      </div>
    )
  }

  if (error || !match || !homeTeam || !awayTeam) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{error ?? "No se pudo cargar"}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="flex items-center justify-between p-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/mesa")}
            aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="text-sm font-medium">Pre Planilla</div>
          <div className="w-9" />
        </div>
      </header>

      {step === "teams" && (
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-lg border overflow-hidden text-left"
              onClick={() => {
                setActiveSide("home")
                setStep("roster")
              }}
            >
              <div className="p-2 text-white text-sm font-semibold" style={{ backgroundColor: "#4CAF50" }}>
                LOCAL
              </div>
              <div className="p-3 bg-card">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{homeTeam.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {state.home.confirmed ? "Confirmado" : "Pendiente"}
                    </div>
                  </div>
                  {state.home.confirmed ? (
                    <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="rounded-lg border overflow-hidden text-left"
              onClick={() => {
                setActiveSide("away")
                setStep("roster")
              }}
            >
              <div className="p-2 text-white text-sm font-semibold" style={{ backgroundColor: "#4CAF50" }}>
                VISITANTE
              </div>
              <div className="p-3 bg-card">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{awayTeam.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {state.away.confirmed ? "Confirmado" : "Pendiente"}
                    </div>
                  </div>
                  {state.away.confirmed ? (
                    <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center">
            <Button variant="outline" onClick={() => setNoShowDialogOpen(true)}>
              Finalizar por no presentación
            </Button>
          </div>

          {bothConfirmed && (
            <div className="mt-6 flex items-center justify-center">
              <Button
                size="lg"
                className="h-16 w-16 rounded-full"
                onClick={() => router.push(`/mesa/planilla/${matchId}`)}
              >
                <Play className="h-6 w-6" />
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={noShowDialogOpen} onOpenChange={setNoShowDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finalizar por no presentación</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm">Seleccioná el equipo que no se presentó.</div>

            <div className="grid gap-2">
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-left ${noShowAbsentSide === "home" ? "border-primary" : ""}`}
                onClick={() => setNoShowAbsentSide("home")}
                disabled={noShowSubmitting}
              >
                <div className="text-xs text-muted-foreground">No se presentó</div>
                <div className="font-semibold">{homeTeam.name} (LOCAL)</div>
              </button>
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-left ${noShowAbsentSide === "away" ? "border-primary" : ""}`}
                onClick={() => setNoShowAbsentSide("away")}
                disabled={noShowSubmitting}
              >
                <div className="text-xs text-muted-foreground">No se presentó</div>
                <div className="font-semibold">{awayTeam.name} (VISITANTE)</div>
              </button>
            </div>

            {noShowError && <div className="text-sm text-destructive">{noShowError}</div>}

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              Resultado:
              <div className="mt-1 font-semibold">
                {noShowAbsentSide === "home" ? `${awayTeam.name} 20 – 0 ${homeTeam.name}` : `${homeTeam.name} 20 – 0 ${awayTeam.name}`}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                El equipo presente suma 2 puntos. El equipo ausente suma NP y 0 puntos.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNoShowDialogOpen(false)} disabled={noShowSubmitting}>
              Cancelar
            </Button>
            <Button onClick={finalizeNoShow} disabled={noShowSubmitting}>
              Finalizar partido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {step === "roster" && activeTeam && (
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{activeSide === "home" ? "Equipo local" : "Equipo visitante"}</div>
              <div className="text-xs text-muted-foreground">{activeTeam.name}</div>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setStep("teams")
              }}
            >
              Volver
            </Button>
          </div>

          <Card>
            <CardContent className="p-3 space-y-2">
              <Label>Entrenador / Asistente</Label>
              {staffOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay técnicos/asistentes cargados para este equipo.</p>
              ) : (
                <div className="space-y-2">
                  {staffOptions.map((s: StaffRow) => {
                    const selectedIndex = activeState.staffIds.indexOf(s.id)
                    const selected = selectedIndex !== -1
                    const tag = selected ? (selectedIndex === 0 ? "DT" : "AS") : null
                    const disabled = !selected && activeState.staffIds.length >= 2

                    return (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                        <div>
                          <div className="text-sm font-medium">
                            {s.lastName.toUpperCase()}, {s.firstName}
                          </div>
                          <div className="text-xs text-muted-foreground">{s.role === "tecnico" ? "Técnico" : "Asistente"}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          {tag && <span className="text-xs font-semibold text-primary">{tag}</span>}
                          <Checkbox checked={selected} disabled={disabled} onCheckedChange={() => toggleStaffSelected(s.id)} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Jugadores</div>
                <div className="text-xs text-muted-foreground">{activeState.selectedPlayerIds.length}/12</div>
              </div>

              <div className="space-y-2">
                {activePlayers
                  .slice()
                  .sort(
                    (a: Player, b: Player) => getJersey(a, activeState) - getJersey(b, activeState),
                  )
                  .map((p: Player) => {
                    const selected = activeState.selectedPlayerIds.includes(p.id)
                    const jersey = getJersey(p, activeState)
                    const enabled = canSelectPlayer(p)
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <button
                            type="button"
                            className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-bold"
                            onClick={() => openJerseyDialog(p)}
                          >
                            {jersey}
                          </button>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="min-w-0 truncate text-sm font-medium">
                                {p.lastName.toUpperCase()}, {p.firstName}
                              </div>
                              <div
                                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                                  p.isFederated
                                    ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {p.isFederated ? "Federado" : "No federado"}
                              </div>
                            </div>
                          </div>
                        </div>
                        <Checkbox checked={selected} disabled={!enabled} onCheckedChange={() => togglePlayerSelected(p.id)} />
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            disabled={!canContinueRoster()}
            onClick={() => setStep("starters")}
          >
            Seleccionar jugadores para el partido
          </Button>

          <Dialog open={jerseyDialogOpen} onOpenChange={setJerseyDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cambiar Dorsal</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="jersey">Dorsal</Label>
                <Input
                  id="jersey"
                  value={jerseyDialogValue}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setJerseyDialogValue(e.target.value)}
                  inputMode="numeric"
                />
                {jerseyDialogError && <p className="text-sm text-destructive">{jerseyDialogError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setJerseyDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={commitJerseyChange}>Cambiar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {step === "starters" && activeTeam && (
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Iniciales y capitán</div>
              <div className="text-xs text-muted-foreground">{activeTeam.name}</div>
            </div>
            <Button variant="outline" onClick={() => setStep("roster")}>
              Volver
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {selectedPlayers.map(({ player, jersey }: { player: Player; jersey: number }) => (
              <StarterTile
                key={player.id}
                playerId={player.id}
                jersey={jersey}
                name={`${player.lastName.toUpperCase()}, ${player.firstName}`}
                selected={activeState.starters.includes(player.id)}
                captain={activeState.captainId === player.id}
                onToggle={() => toggleStarter(player.id)}
                onCaptain={() => setCaptain(player.id)}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>Seleccionados: {activeState.starters.length}</div>
            <div>Capitán: {activeState.captainId ? "OK" : "Falta"}</div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!canContinueStarters()}
            onClick={() => {
              // Marcar equipo como confirmado sin requerir firma digital
              setState((prev: PrePlanillaState) => ({
                ...prev,
                [activeSide]: {
                  ...prev[activeSide],
                  confirmed: true,
                },
              }))

              // Si el otro equipo aún no está confirmado, pasar a su roster
              if (!state[otherSide].confirmed) {
                setActiveSide(otherSide)
                setStep("roster")
              } else {
                // Ambos confirmados: volver a la pantalla principal de equipos
                setStep("teams")
              }
            }}
          >
            Confirmar equipo
          </Button>
        </div>
      )}
    </div>
  )
}

function StarterTile({
  playerId,
  jersey,
  name,
  selected,
  captain,
  onToggle,
  onCaptain,
}: {
  playerId: string
  jersey: number
  name: string
  selected: boolean
  captain: boolean
  onToggle: () => void
  onCaptain: () => void
}) {
  const [pressTimeoutId, setPressTimeoutId] = useState<number | null>(null)
  const [longPressTriggered, setLongPressTriggered] = useState(false)

  const clearPressTimeout = () => {
    if (pressTimeoutId) window.clearTimeout(pressTimeoutId)
    setPressTimeoutId(null)
  }

  return (
    <button
      type="button"
      className={`rounded-lg border p-3 text-left ${selected ? "bg-primary/10 border-primary" : "bg-card"}`}
      onPointerDown={() => {
        setLongPressTriggered(false)
        const id = window.setTimeout(() => {
          setLongPressTriggered(true)
          onCaptain()
        }, 380)
        setPressTimeoutId(id)
      }}
      onPointerUp={() => {
        clearPressTimeout()
        if (!longPressTriggered) onToggle()
      }}
      onPointerCancel={() => {
        clearPressTimeout()
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-2xl font-bold leading-none">{jersey}</div>
        {captain && <span className="text-xs font-semibold text-primary">CAP</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{name}</div>
    </button>
  )
}
