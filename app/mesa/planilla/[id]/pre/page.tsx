"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  signatureDataUrl: string | null
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
  status: "programado" | "en_juego" | "finalizado"
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
  signatureDataUrl: null,
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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [match, setMatch] = useState<DbMatchRow | null>(null)
  const [homeTeam, setHomeTeam] = useState<TeamInfo | null>(null)
  const [awayTeam, setAwayTeam] = useState<TeamInfo | null>(null)
  const [homePlayers, setHomePlayers] = useState<Player[]>([])
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([])
  const [staffByTeamId, setStaffByTeamId] = useState<Record<string, StaffRow[]>>({})

  const [step, setStep] = useState<"teams" | "roster" | "starters" | "signature">("teams")
  const [activeSide, setActiveSide] = useState<Side>("home")

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

      if (teamsRes.error) setError((prev) => prev ?? teamsRes.error.message)
      if (playersRes.error) setError((prev) => prev ?? playersRes.error.message)

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

      const home = allPlayers.filter((p) => p.teamId === mappedMatch.home_team_id)
      const away = allPlayers.filter((p) => p.teamId === mappedMatch.away_team_id)
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
      .filter((p) => ids.has(p.id))
      .map((p) => ({ player: p, jersey: getJersey(p, activeState) }))
      .sort((a, b) => a.jersey - b.jersey)
  }, [activePlayers, activeState])

  const staffOptions = useMemo(() => {
    if (!activeTeam) return []
    return staffByTeamId[activeTeam.id] ?? []
  }, [staffByTeamId, activeTeam])

  const toggleStaffSelected = (staffId: string) => {
    setState((prev) => {
      const cur = prev[activeSide]
      const exists = cur.staffIds.includes(staffId)
      if (exists) {
        return {
          ...prev,
          [activeSide]: {
            ...cur,
            staffIds: cur.staffIds.filter((id) => id !== staffId),
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

  const commitJerseyChange = () => {
    if (!jerseyDialogPlayer) return
    const raw = jerseyDialogValue.trim()
    const next = Number(raw)

    if (!raw || Number.isNaN(next) || next <= 0) {
      setJerseyDialogError("Número inválido")
      return
    }

    const selectedIds = new Set(activeState.selectedPlayerIds)
    const duplicates = activePlayers
      .filter((p) => selectedIds.has(p.id) && p.id !== jerseyDialogPlayer.id)
      .some((p) => getJersey(p, activeState) === next)

    if (duplicates) {
      setJerseyDialogError("Ya hay un jugador seleccionado con ese dorsal")
      return
    }

    setState((prev) => ({
      ...prev,
      [activeSide]: {
        ...prev[activeSide],
        jerseyByPlayerId: {
          ...prev[activeSide].jerseyByPlayerId,
          [jerseyDialogPlayer.id]: next,
        },
      },
    }))

    setJerseyDialogOpen(false)
    setJerseyDialogPlayer(null)
  }

  const togglePlayerSelected = (playerId: string) => {
    setState((prev) => {
      const cur = prev[activeSide]
      const exists = cur.selectedPlayerIds.includes(playerId)

      if (exists) {
        const nextSelected = cur.selectedPlayerIds.filter((id) => id !== playerId)
        const nextStarters = cur.starters.filter((id) => id !== playerId)
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

      const player = activePlayers.find((p) => p.id === playerId)
      if (!player) return prev
      const jersey = getJersey(player, cur)

      const duplicates = cur.selectedPlayerIds
        .map((id) => activePlayers.find((p) => p.id === id))
        .filter(Boolean)
        .some((p) => p && getJersey(p, cur) === jersey)

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
      .filter((p) => selectedIds.has(p.id))
      .some((p) => getJersey(p, activeState) === jersey)

    return !duplicate
  }

  const toggleStarter = (playerId: string) => {
    setState((prev) => {
      const cur = prev[activeSide]
      if (!cur.selectedPlayerIds.includes(playerId)) return prev
      const exists = cur.starters.includes(playerId)
      const nextStarters = exists ? cur.starters.filter((id) => id !== playerId) : [...cur.starters, playerId]
      const nextCaptainId = exists && cur.captainId === playerId ? null : cur.captainId
      return { ...prev, [activeSide]: { ...cur, starters: nextStarters, captainId: nextCaptainId } }
    })
  }

  const setCaptain = (playerId: string) => {
    setState((prev) => {
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
      .filter((p) => selectedIds.has(p.id))
      .map((p) => getJersey(p, activeState))

    return new Set(jerseys).size === jerseys.length
  }

  const canContinueStarters = () => {
    if (activeState.starters.length < 3) return false
    if (!activeState.captainId) return false
    if (!activeState.starters.includes(activeState.captainId)) return false
    return true
  }

  const confirmSignature = (dataUrl: string | null) => {
    setState((prev) => ({
      ...prev,
      [activeSide]: {
        ...prev[activeSide],
        signatureDataUrl: dataUrl,
        confirmed: Boolean(dataUrl),
      },
    }))

    setStep("teams")
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
                  {staffOptions.map((s) => {
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
                  .sort((a, b) => getJersey(a, activeState) - getJersey(b, activeState))
                  .map((p) => {
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
                  onChange={(e) => setJerseyDialogValue(e.target.value)}
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
            {selectedPlayers.map(({ player, jersey }) => (
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

          <Button className="w-full" size="lg" disabled={!canContinueStarters()} onClick={() => setStep("signature")}>
            Iniciar firma
          </Button>
        </div>
      )}

      {step === "signature" && activeTeam && (
        <SignatureStep
          teamName={activeTeam.name}
          staffName={(() => {
            const primaryId = activeState.staffIds[0]
            const staff = primaryId ? staffOptions.find((s) => s.id === primaryId) : null
            if (!staff) return ""
            return `${staff.lastName.toUpperCase()}, ${staff.firstName}`
          })()}
          initialDataUrl={activeState.signatureDataUrl}
          onBack={() => setStep("starters")}
          onConfirm={(dataUrl) => {
            confirmSignature(dataUrl)
            if (activeSide === "home" && !state.away.confirmed) {
              setActiveSide("away")
            }
            if (activeSide === "away" && !state.home.confirmed) {
              setActiveSide("home")
            }
          }}
          nextActionLabel={nextActionLabel}
          canProceedNext={!state[otherSide].confirmed}
        />
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
      <div className="mt-2 text-xs">{selected ? "Titular" : "No"}</div>
    </button>
  )
}

function SignatureStep({
  teamName,
  staffName,
  initialDataUrl,
  onBack,
  onConfirm,
  nextActionLabel,
  canProceedNext,
}: {
  teamName: string
  staffName: string
  initialDataUrl: string | null
  onBack: () => void
  onConfirm: (dataUrl: string | null) => void
  nextActionLabel: string
  canProceedNext: boolean
}) {
  const [mode, setMode] = useState<"idle" | "signing" | "signed">(initialDataUrl ? "signed" : "idle")
  const [dataUrl, setDataUrl] = useState<string | null>(initialDataUrl)

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Firma y jugadores iniciales</div>
          <div className="text-xs text-muted-foreground">{teamName}</div>
        </div>
        <Button variant="outline" onClick={onBack}>
          Volver
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="text-sm font-medium">Técnico / Asistente</div>
          <div className="text-sm text-muted-foreground">{staffName || ""}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-3">
          <SignaturePad
            enabled={mode === "signing"}
            initialDataUrl={dataUrl}
            onChange={(next) => setDataUrl(next)}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDataUrl(null)
                setMode("signing")
              }}
            >
              Limpiar
            </Button>
            <Button
              onClick={() => {
                if (mode === "idle") {
                  setMode("signing")
                  return
                }

                if (mode === "signing") {
                  onConfirm(dataUrl)
                  setMode("signed")
                  return
                }
              }}
              disabled={mode === "signed" || (!dataUrl && mode !== "idle")}
            >
              {mode === "idle" ? "Iniciar firma" : mode === "signing" ? "Terminar" : "Firmado"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SignaturePad({
  enabled,
  initialDataUrl,
  onChange,
}: {
  enabled: boolean
  initialDataUrl: string | null
  onChange: (dataUrl: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.lineWidth = 3
      ctx.strokeStyle = "#1e40af"

      ctx.clearRect(0, 0, rect.width, rect.height)

      if (initialDataUrl) {
        const img = new Image()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, rect.height)
        }
        img.src = initialDataUrl
      }
    }

    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [initialDataUrl])

  const getPos = (e: PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const onDown = (e: PointerEvent) => {
      if (!enabled) return
      drawingRef.current = true
      lastRef.current = getPos(e, canvas)
    }

    const onMove = (e: PointerEvent) => {
      if (!enabled) return
      if (!drawingRef.current) return
      const last = lastRef.current
      if (!last) return
      const next = getPos(e, canvas)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(next.x, next.y)
      ctx.stroke()
      lastRef.current = next
    }

    const onUp = () => {
      if (!enabled) return
      if (!drawingRef.current) return
      drawingRef.current = false
      lastRef.current = null
      onChange(canvas.toDataURL("image/png"))
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)

    return () => {
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
    }
  }, [enabled, onChange])

  return (
    <div className="rounded-lg border bg-muted/30">
      <div className="px-3 pt-3 text-xs text-muted-foreground">{enabled ? "Firmá aquí" : "Presioná Iniciar firma"}</div>
      <div className="p-3">
        <canvas ref={canvasRef} className="h-40 w-full rounded-md bg-white" />
      </div>
    </div>
  )
}
