"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAppStore } from "@/lib/store"
import {
  ArrowLeft,
  Undo2,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  Wifi,
  WifiOff,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Check,
  X as XIcon,
} from "lucide-react"
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Player, MatchEvent } from "@/lib/types"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type SyncStatus = "synced" | "pending" | "syncing" | "error"

type DbMatchRow = {
  id: string
  homeTeamId: string
  awayTeamId: string
  status: "programado" | "en_juego" | "finalizado"
  homeScore: number | null
  awayScore: number | null
}

type DbTeamRow = {
  id: string
  name: string
  primaryColor: string
}

export default function PlanillaPage() {
  const params = useParams()
  const router = useRouter()
  const matchId = params.id as string

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const { matches, teams, players, updateMatch, addMatchEvent, removeLastMatchEvent, matchEvents } = useAppStore()

  const storeMatch = matches.find((m) => m.id === matchId)
  const storeHomeTeam = teams.find((t) => t.id === storeMatch?.homeTeamId)
  const storeAwayTeam = teams.find((t) => t.id === storeMatch?.awayTeamId)
  const storeHomePlayers = players.filter((p) => p.teamId === storeMatch?.homeTeamId)
  const storeAwayPlayers = players.filter((p) => p.teamId === storeMatch?.awayTeamId)

  const [dbLoading, setDbLoading] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  const [dbMatch, setDbMatch] = useState<DbMatchRow | null>(null)
  const [dbHomeTeam, setDbHomeTeam] = useState<DbTeamRow | null>(null)
  const [dbAwayTeam, setDbAwayTeam] = useState<DbTeamRow | null>(null)
  const [dbHomePlayers, setDbHomePlayers] = useState<Player[]>([])
  const [dbAwayPlayers, setDbAwayPlayers] = useState<Player[]>([])

  // Función para obtener datos de la pre planilla
  const getPrePlanillaData = () => {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(`preplanilla:${matchId}`)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  // Función para obtener el staff seleccionado de la pre planilla
  const getSelectedStaff = () => {
    const prePlanilla = getPrePlanillaData()
    if (!prePlanilla) return { homeStaff: [], awayStaff: [] }
    
    // Aquí deberíamos cargar los datos del staff de la base de datos
    // y filtrar según los IDs seleccionados en la pre planilla
    return { 
      homeStaff: prePlanilla.home.staffIds || [], 
      awayStaff: prePlanilla.away.staffIds || [] 
    }
  }

  // Cargar datos del staff de la base de datos
  const [staffData, setStaffData] = useState<Record<string, any>>({})

  useEffect(() => {
    const run = async () => {
      if (storeMatch) return
      setDbLoading(true)
      setDbError(null)

      const { data: matchRow, error: matchError } = await supabase
        .from("matches")
        .select("id, home_team_id, away_team_id, status, home_score, away_score")
        .eq("id", matchId)
        .maybeSingle()

      if (matchError || !matchRow) {
        setDbError(matchError?.message ?? "Partido no encontrado")
        setDbLoading(false)
        return
      }

      const mappedMatch: DbMatchRow = {
        id: matchRow.id,
        homeTeamId: matchRow.home_team_id,
        awayTeamId: matchRow.away_team_id,
        status: matchRow.status,
        homeScore: matchRow.home_score,
        awayScore: matchRow.away_score,
      }
      setDbMatch(mappedMatch)

      const [homeTeamRes, awayTeamRes, playersRes] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, primary_color")
          .eq("id", mappedMatch.homeTeamId)
          .maybeSingle(),
        supabase
          .from("teams")
          .select("id, name, primary_color")
          .eq("id", mappedMatch.awayTeamId)
          .maybeSingle(),
        supabase
          .from("players")
          .select("id, team_id, first_name, last_name, jersey_number, is_federated, photo_url")
          .in("team_id", [mappedMatch.homeTeamId, mappedMatch.awayTeamId]),
      ])

      if (homeTeamRes.error) setDbError((prev) => prev ?? homeTeamRes.error.message)
      if (awayTeamRes.error) setDbError((prev) => prev ?? awayTeamRes.error.message)
      if (playersRes.error) setDbError((prev) => prev ?? playersRes.error.message)

      const nextHomeTeam = homeTeamRes.data
        ? ({
            id: homeTeamRes.data.id,
            name: homeTeamRes.data.name,
            primaryColor: homeTeamRes.data.primary_color ?? "#666",
          } satisfies DbTeamRow)
        : null

      const nextAwayTeam = awayTeamRes.data
        ? ({
            id: awayTeamRes.data.id,
            name: awayTeamRes.data.name,
            primaryColor: awayTeamRes.data.primary_color ?? "#666",
          } satisfies DbTeamRow)
        : null

      setDbHomeTeam(nextHomeTeam)
      setDbAwayTeam(nextAwayTeam)

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

      setDbHomePlayers(allPlayers.filter((p) => p.teamId === mappedMatch.homeTeamId))
      setDbAwayPlayers(allPlayers.filter((p) => p.teamId === mappedMatch.awayTeamId))

      setDbLoading(false)
    }

    run()
  }, [storeMatch, supabase, matchId])

  const match = storeMatch ??
    (dbMatch
      ? ({
          id: dbMatch.id,
          categoryId: "",
          homeTeamId: dbMatch.homeTeamId,
          awayTeamId: dbMatch.awayTeamId,
          round: 1,
          phase: "fase_regular",
          status: dbMatch.status,
          refereeIds: [],
          tableOfficialIds: [],
          homeScore: dbMatch.homeScore ?? undefined,
          awayScore: dbMatch.awayScore ?? undefined,
        } as any)
      : undefined)

  const homeTeam = storeHomeTeam ?? (dbHomeTeam as any)
  const awayTeam = storeAwayTeam ?? (dbAwayTeam as any)
  
  // Obtener datos de la pre planilla
  const prePlanillaData = getPrePlanillaData()
  
  // Filtrar jugadores para mostrar solo titulares y capitanes de la pre planilla
  const homePlayers = useMemo(() => {
    const allPlayers = storeMatch ? storeHomePlayers : dbHomePlayers
    if (!prePlanillaData) {
      return allPlayers // Si no hay datos de pre planilla, mostrar todos
    }
    
    // Obtener IDs de titulares y capitanes
    const starterAndCaptainIds = [
      ...(prePlanillaData.home.starters || []),
      prePlanillaData.home.captainId
    ].filter(Boolean) as string[]
    
    // Si no hay titulares definidos, mostrar todos los jugadores seleccionados
    if (starterAndCaptainIds.length === 0 && prePlanillaData.home.selectedPlayerIds?.length > 0) {
      return allPlayers.filter(player => prePlanillaData.home.selectedPlayerIds.includes(player.id))
    }
    
    return allPlayers.filter(player => starterAndCaptainIds.includes(player.id))
  }, [storeMatch, storeHomePlayers, dbHomePlayers, prePlanillaData])
  
  const awayPlayers = useMemo(() => {
    const allPlayers = storeMatch ? storeAwayPlayers : dbAwayPlayers
    if (!prePlanillaData) {
      return allPlayers // Si no hay datos de pre planilla, mostrar todos
    }
    
    // Obtener IDs de titulares y capitanes
    const starterAndCaptainIds = [
      ...(prePlanillaData.away.starters || []),
      prePlanillaData.away.captainId
    ].filter(Boolean) as string[]
    
    // Si no hay titulares definidos, mostrar todos los jugadores seleccionados
    if (starterAndCaptainIds.length === 0 && prePlanillaData.away.selectedPlayerIds?.length > 0) {
      return allPlayers.filter(player => prePlanillaData.away.selectedPlayerIds.includes(player.id))
    }
    
    return allPlayers.filter(player => starterAndCaptainIds.includes(player.id))
  }, [storeMatch, storeAwayPlayers, dbAwayPlayers, prePlanillaData])

  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [period, setPeriod] = useState(1)
  const [gameTime, setGameTime] = useState(10 * 60) // in seconds
  const [isRunning, setIsRunning] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<"home" | "away">("home")
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [pendingReboundTeamId, setPendingReboundTeamId] = useState<string | null>(null)
  const [pendingAssistTeamId, setPendingAssistTeamId] = useState<string | null>(null)
  const [pendingAssistScorerId, setPendingAssistScorerId] = useState<string | null>(null)
  const [pendingFreeThrow, setPendingFreeThrow] = useState<
    { playerId: string; teamId: string; teamSide: "home" | "away"; total: 1 | 2 | 3; current: number } | null
  >(null)
  const [lastScoreFlash, setLastScoreFlash] = useState<{ teamSide: "home" | "away"; points: 2 | 3 } | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced")
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false)
  const [showFreeThrowDialog, setShowFreeThrowDialog] = useState(false)
  const [freeThrowDialogPlayer, setFreeThrowDialogPlayer] = useState<
    { id: string; teamSide: "home" | "away" } | null
  >(null)
  const [freeThrowTotal, setFreeThrowTotal] = useState<1 | 2 | 3>(2)
  const [freeThrowAttempts, setFreeThrowAttempts] = useState<Record<1 | 2 | 3, "made" | "missed" | null>>({ 1: null, 2: null, 3: null })
  const [selectedFreeThrowFoulId, setSelectedFreeThrowFoulId] = useState<string | null>(null)
  const [localEvents, setLocalEvents] = useState<MatchEvent[]>([])
  const [mainTab, setMainTab] = useState<"cancha" | "historial" | "otros" | "configuracion" | "estadisticas">("cancha")
  
  // Estados para faltas
  const [showPersonalFoulDialog, setShowPersonalFoulDialog] = useState(false)
  const [showOtherFoulDialog, setShowOtherFoulDialog] = useState(false)
  const [personalFoulPlayerId, setPersonalFoulPlayerId] = useState<string | null>(null)
  const [personalFoulTeamSide, setPersonalFoulTeamSide] = useState<"home" | "away" | null>(null)
  const [selectedFoulType, setSelectedFoulType] = useState<"unsportsmanlike" | "disqualifying" | "fight" | "technical">("unsportsmanlike")
  const [selectedFoulTeam, setSelectedFoulTeam] = useState<"home" | "away">("home")
  const [teamFoulWarning, setTeamFoulWarning] = useState<{ home: boolean; away: boolean }>({ home: false, away: false })

  // Cargar datos del staff seleccionado
  useEffect(() => {
    const loadStaffData = async () => {
      if (!homeTeam || !awayTeam) return
      
      const selectedStaff = getSelectedStaff()
      const allStaffIds = [...selectedStaff.homeStaff, ...selectedStaff.awayStaff]
      
      if (allStaffIds.length === 0) return
      
      const { data } = await supabase
        .from("coaching_staff")
        .select("id, team_id, first_name, last_name, role")
        .in("id", allStaffIds)
      
      if (data) {
        const staffMap: Record<string, any> = {}
        data.forEach(staff => {
          staffMap[staff.id] = staff
        })
        setStaffData(staffMap)
      }
    }
    
    loadStaffData()
  }, [homeTeam, awayTeam, prePlanillaData])

  useEffect(() => {
    if (!match) return
    setHomeScore(match.homeScore ?? 0)
    setAwayScore(match.awayScore ?? 0)
  }, [match?.homeScore, match?.awayScore, match?.id])

  // Online status
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

  const getPeriodDurationSeconds = useCallback((p: number) => (p <= 4 ? 10 * 60 : 5 * 60), [])

  const periodLabel = useMemo(() => {
    if (period <= 4) return `Período ${period}`
    return `Prórroga ${period - 4}`
  }, [period])

  // Timer
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRunning) {
      interval = setInterval(() => {
        setGameTime((prev) => Math.max(0, prev - 1))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRunning])

  useEffect(() => {
    if (!isRunning) return
    if (gameTime > 0) return
    setIsRunning(false)
    setShowAdvanceDialog(true)
  }, [gameTime, isRunning])

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const opponentTeamIdForFreeThrows = useMemo(() => {
    if (!freeThrowDialogPlayer) return null
    if (!homeTeam || !awayTeam) return null
    return freeThrowDialogPlayer.teamSide === "home" ? awayTeam.id : homeTeam.id
  }, [freeThrowDialogPlayer, homeTeam, awayTeam])

  const opponentFoulsForFreeThrows = useMemo(
    () =>
      localEvents
        .filter((e) => e.type === "foul" && opponentTeamIdForFreeThrows && e.teamId === opponentTeamIdForFreeThrows)
        .slice()
        .reverse(),
    [localEvents, opponentTeamIdForFreeThrows],
  )

  // Contadores de faltas por equipo en el período actual
  const teamFoulsInPeriod = useMemo(() => {
    if (!homeTeam || !awayTeam) return { home: 0, away: 0 }
    
    const fouls = localEvents.filter(e => e.type === "foul" && e.period === period)
    const homeFouls = fouls.filter(e => e.teamId === homeTeam.id).length
    const awayFouls = fouls.filter(e => e.teamId === awayTeam.id).length
    return { home: homeFouls, away: awayFouls }
  }, [localEvents, period, homeTeam?.id, awayTeam?.id, homeTeam, awayTeam])

  // Verificar si equipos están en infracción
  useEffect(() => {
    setTeamFoulWarning({
      home: teamFoulsInPeriod.home >= 4,
      away: teamFoulsInPeriod.away >= 4
    })
  }, [teamFoulsInPeriod])

  // Función para verificar si un jugador está descalificado
  const isPlayerDisqualified = (playerId: string): boolean => {
    const playerEvents = localEvents.filter(e => e.playerId === playerId && e.type === "foul")
    
    const personalFouls = playerEvents.filter(e => e.foulType === "personal").length
    const technicalFouls = playerEvents.filter(e => e.foulType === "technical").length
    const unsportsmanlikeFouls = playerEvents.filter(e => e.foulType === "unsportsmanlike").length
    const disqualifyingFouls = playerEvents.filter(e => e.foulType === "disqualifying").length
    const fightFouls = playerEvents.filter(e => e.foulType === "fight").length
    
    // Reglas de descalificación
    return (
      personalFouls >= 5 ||
      technicalFouls >= 2 ||
      unsportsmanlikeFouls >= 2 ||
      (technicalFouls >= 1 && unsportsmanlikeFouls >= 1) ||
      disqualifyingFouls >= 1 ||
      fightFouls >= 1
    )
  }

  // Actualizar lista de jugadores descalificados
  const disqualifiedPlayers = useMemo(() => {
    const disqualified = new Set<string>()
    ;[...homePlayers, ...awayPlayers].forEach(player => {
      if (isPlayerDisqualified(player.id)) {
        disqualified.add(player.id)
      }
    })
    return disqualified
  }, [localEvents, homePlayers, awayPlayers])

  const getFreeThrowCountForFoul = (foul: MatchEvent): 1 | 2 | 3 => {
    const type = foul.foulType
    if (type === "technical") return 1
    if (type === "unsportsmanlike") return 2
    // Personal: permitimos hasta 3 intentos; la cantidad efectiva será la que el operador marque
    return 3
  }

  // Función para determinar si una falta personal da tiros libres por infracción de equipo
  const getTeamFoulFreeThrows = (teamSide: "home" | "away"): 0 | 2 => {
    const fouls = teamFoulsInPeriod[teamSide]
    return fouls >= 5 ? 2 : 0 // A partir de 5 faltas, 2 tiros libres
  }

  // Add foul
  const addFoul = useCallback(
    (playerId: string, teamSide: "home" | "away", foulType: MatchEvent["foulType"] = "personal") => {
      if (match?.status !== "en_juego" || !homeTeam || !awayTeam) return
      
      // Verificar si el jugador está descalificado (excepto para personal técnico)
      if (!playerId.startsWith("tech-") && !playerId.startsWith("assist-") && isPlayerDisqualified(playerId)) {
        return // No permitir registrar faltas a jugadores descalificados
      }
      
      const event: MatchEvent = {
        id: `ev-${Date.now()}`,
        matchId,
        playerId,
        teamId: teamSide === "home" ? homeTeam.id : awayTeam.id,
        type: "foul",
        foulType,
        period,
        timestamp: new Date(),
        gameTime: formatTime(gameTime),
      }

      setLocalEvents((prev) => [...prev, event])
      addMatchEvent(event)
      setSyncStatus("pending")
      
      // Verificar si después de esta falta el jugador queda descalificado
      if (!playerId.startsWith("tech-") && !playerId.startsWith("assist-") && isPlayerDisqualified(playerId)) {
        // El jugador queda descalificado, podría mostrar una notificación
        console.log(`Jugador ${playerId} descalificado por acumulación de faltas`)
      }
      
      // Verificar si el equipo entra en infracción con esta falta
      const currentTeamFouls = teamFoulsInPeriod[teamSide] + 1
      if (currentTeamFouls === 4) {
        // El equipo acaba de entrar en infracción
        console.log(`Equipo ${teamSide} entra en infracción (4 faltas)`)
      }
    },
    [matchId, homeTeam, awayTeam, period, gameTime, addMatchEvent, isPlayerDisqualified, teamFoulsInPeriod],
  )

  // Undo last action
  const undoLastAction = () => {
    if (localEvents.length === 0) return

    const lastEvent = localEvents[localEvents.length - 1]

    if (lastEvent.type === "points" && lastEvent.points) {
      if (lastEvent.teamId === homeTeam?.id) setHomeScore((prev) => Math.max(0, prev - lastEvent.points!))
      else setAwayScore((prev) => Math.max(0, prev - lastEvent.points!))
    }

    if (lastEvent.type === "shot" && lastEvent.made && lastEvent.shotType) {
      if (lastEvent.teamId === homeTeam?.id) setHomeScore((prev) => Math.max(0, prev - lastEvent.shotType!))
      else setAwayScore((prev) => Math.max(0, prev - lastEvent.shotType!))
    }

    if (lastEvent.type === "free_throw" && lastEvent.made) {
      if (lastEvent.teamId === homeTeam?.id) setHomeScore((prev) => Math.max(0, prev - 1))
      else setAwayScore((prev) => Math.max(0, prev - 1))
    }

    if (lastEvent.type === "shot" && lastEvent.made === false) {
      setPendingReboundTeamId(null)
    }

    setPendingAssistTeamId(null)
    setPendingAssistScorerId(null)
    setPendingFreeThrow(null)

    setLocalEvents((prev) => prev.slice(0, -1))
    removeLastMatchEvent(matchId)
  }

  const persistMatch = useCallback(
    async (payload: { status?: "programado" | "en_juego" | "finalizado"; homeScore?: number; awayScore?: number }) => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setSyncStatus("error")
        return
      }

      const res = await fetch(`/api/mesa/matches/${matchId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        setSyncStatus("error")
      }
    },
    [matchId, supabase],
  )

  // End match
  const endMatch = async () => {
    updateMatch(matchId, {
      status: "finalizado",
      homeScore,
      awayScore,
    })
    setSyncStatus("syncing")
    await persistMatch({ status: "finalizado", homeScore, awayScore })
    setSyncStatus("synced")
    router.push("/mesa")
  }

  // Sync simulation
  useEffect(() => {
    if (match?.status === "en_juego" && syncStatus === "pending" && isOnline) {
      const timer = setTimeout(() => {
        // Solo actualizamos el store local; los datos se envían a la base recién al finalizar el partido.
        updateMatch(matchId, { homeScore, awayScore })
        setSyncStatus("synced")
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [syncStatus, isOnline, matchId, homeScore, awayScore, updateMatch, persistMatch])

  if (dbLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Cargando partido...</p>
      </div>
    )
  }

  if (dbError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">{dbError}</p>
      </div>
    )
  }

  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Partido no encontrado</p>
      </div>
    )
  }

  const getPlayerTeam = (playerId: string): { teamId: string; teamSide: "home" | "away" } | null => {
    const homePlayer = homePlayers.find((p) => p.id === playerId)
    if (homePlayer) return { teamId: homePlayer.teamId, teamSide: "home" }
    const awayPlayer = awayPlayers.find((p) => p.id === playerId)
    if (awayPlayer) return { teamId: awayPlayer.teamId, teamSide: "away" }
    return null
  }

  const getShotTypeByPosition = (x: number, y: number, teamSide: "home" | "away") => {
    // Las coords (x,y) vienen en "modelo" (portrait 0..1) pero el dibujo y el toque son landscape.
    // Usamos la misma transformación inversa que aplica ShotMap:
    // model = { x: 1 - uiY, y: uiX } => uiX = model.y, uiY = 1 - model.x
    // y llevamos a coordenadas del SVG (viewBox 1000x536).
    const sx = y * 1000
    const sy = (1 - x) * 536

    const isLeftHoop = teamSide === "home"
    const hoop = isLeftHoop ? { x: 55, y: 268 } : { x: 945, y: 268 }

    // Geometría exacta del SVG actual:
    // - rectas de esquina: y=52 y y=484 desde x=18 hasta x=200 (lado izq)
    // - arco: círculo de radio 260 centrado en el aro, empalmando en x=200
    const yMin = 52
    const yMax = 484
    const arcR = 260
    const joinX = 200

    // Por definición del dibujo, el 2P es "dentro" de la línea de 3 del aro correspondiente.
    // En el lado opuesto del campo siempre queda afuera => 3P.
    const inBand = sy >= yMin && sy <= yMax
    if (!inBand) return 3

    const dist = Math.hypot(sx - hoop.x, sy - hoop.y)
    if (isLeftHoop) {
      const insideThree = sx <= joinX || dist <= arcR
      return insideThree ? 2 : 3
    }

    const insideThree = sx >= 1000 - joinX || dist <= arcR
    return insideThree ? 2 : 3
  }

  const registerShot = (x: number, y: number, made: boolean) => {
    if (match.status !== "en_juego") return
    if (!selectedPlayerId) return
    if (pendingReboundTeamId) return
    if (pendingFreeThrow) return

    // Si había una asistencia pendiente del tiro anterior y se realiza un nuevo tiro,
    // descartamos la asistencia pendiente.
    if (pendingAssistTeamId || pendingAssistScorerId) {
      setPendingAssistTeamId(null)
      setPendingAssistScorerId(null)
    }

    const playerTeam = getPlayerTeam(selectedPlayerId)
    if (!playerTeam) return

    const shotType = getShotTypeByPosition(x, y, playerTeam.teamSide)
    const event: MatchEvent = {
      id: `ev-${Date.now()}`,
      matchId,
      playerId: selectedPlayerId,
      teamId: playerTeam.teamId,
      type: "shot",
      shotType,
      made,
      x,
      y,
      period,
      timestamp: new Date(),
      gameTime: formatTime(gameTime),
    }

    if (made) {
      if (playerTeam.teamSide === "home") setHomeScore((prev) => prev + shotType)
      else setAwayScore((prev) => prev + shotType)

      // Habilitar asistencia opcional para este tiro convertido
      setPendingAssistTeamId(playerTeam.teamId)
      setPendingAssistScorerId(selectedPlayerId)

      // Mostrar flash visual del puntaje convertido
      setLastScoreFlash({ teamSide: playerTeam.teamSide, points: shotType })
      window.setTimeout(() => {
        setLastScoreFlash((current) => (current && current.teamSide === playerTeam.teamSide && current.points === shotType ? null : current))
      }, 900)
    } else {
      setPendingReboundTeamId(playerTeam.teamId)
    }

    setLocalEvents((prev) => [...prev, event])
    addMatchEvent(event)
    setSyncStatus("pending")
  }

  const startFreeThrows = (total: 1 | 2 | 3) => {
    if (match.status !== "en_juego") return
    if (!selectedPlayerId) return
    if (pendingReboundTeamId || pendingAssistTeamId || pendingFreeThrow) return

    const playerTeam = getPlayerTeam(selectedPlayerId)
    if (!playerTeam) return

    setPendingFreeThrow({
      playerId: selectedPlayerId,
      teamId: playerTeam.teamId,
      teamSide: playerTeam.teamSide,
      total,
      current: 1,
    })
  }

  const registerFreeThrowAttempt = (made: boolean) => {
    if (match.status !== "en_juego") return
    if (!pendingFreeThrow) return

    const { playerId, teamId, teamSide, total, current } = pendingFreeThrow

    const event: MatchEvent = {
      id: `ev-${Date.now()}`,
      matchId,
      playerId,
      teamId,
      type: "free_throw",
      made,
      period,
      timestamp: new Date(),
      gameTime: formatTime(gameTime),
    }

    if (made) {
      if (teamSide === "home") setHomeScore((prev) => prev + 1)
      else setAwayScore((prev) => prev + 1)
    } else if (current === total) {
      setPendingReboundTeamId(teamId)
    }

    setLocalEvents((prev) => [...prev, event])
    addMatchEvent(event)
    setSyncStatus("pending")

    if (current >= total) {
      setPendingFreeThrow(null)
    } else {
      setPendingFreeThrow({ playerId, teamId, teamSide, total, current: current + 1 })
    }
  }

  const registerAssist = (playerId: string) => {
    if (match.status !== "en_juego") return
    if (!pendingAssistTeamId || !pendingAssistScorerId) return
    if (playerId === pendingAssistScorerId) return

    const playerTeam = getPlayerTeam(playerId)
    if (!playerTeam) return
    if (playerTeam.teamId !== pendingAssistTeamId) return

    const event: MatchEvent = {
      id: `ev-${Date.now()}`,
      matchId,
      playerId,
      teamId: playerTeam.teamId,
      type: "assist",
      period,
      timestamp: new Date(),
      gameTime: formatTime(gameTime),
    }

    setPendingAssistTeamId(null)
    setPendingAssistScorerId(null)
    setLocalEvents((prev) => [...prev, event])
    addMatchEvent(event)
    setSyncStatus("pending")
  }

  const registerRebound = (playerId: string) => {
    if (match.status !== "en_juego") return
    if (!pendingReboundTeamId) return
    const playerTeam = getPlayerTeam(playerId)
    if (!playerTeam) return

    const reboundType: MatchEvent["reboundType"] = playerTeam.teamId === pendingReboundTeamId ? "offensive" : "defensive"
    const event: MatchEvent = {
      id: `ev-${Date.now()}`,
      matchId,
      playerId,
      teamId: playerTeam.teamId,
      type: "rebound",
      reboundType,
      period,
      timestamp: new Date(),
      gameTime: formatTime(gameTime),
    }

    setPendingReboundTeamId(null)
    setLocalEvents((prev) => [...prev, event])
    addMatchEvent(event)
    setSyncStatus("pending")
  }

  const PlayerButton = ({ player, teamSide }: { player: Player; teamSide: "home" | "away" }) => {
    const playerEvents = localEvents.filter((e) => e.playerId === player.id)
    const playerFouls = playerEvents.filter((e) => e.type === "foul").length
    const playerPoints = playerEvents.reduce((acc, e) => {
      if (e.type === "points" && e.points) return acc + e.points
      if (e.type === "shot" && e.made && e.shotType) return acc + e.shotType
      if (e.type === "free_throw" && e.made) return acc + 1
      return acc
    }, 0)

    const isSelected = selectedPlayerId === player.id
    const isDisqualified = disqualifiedPlayers.has(player.id)

    return (
      <div className={`rounded-lg border bg-card p-2 ${isSelected ? "border-primary" : ""} ${isDisqualified ? "border-red-500 bg-red-50" : ""}`}>
        <button
          type="button"
          className="w-full"
          disabled={isDisqualified}
          onClick={() => {
            if (pendingFreeThrow) {
              return
            }
            if (pendingAssistTeamId && pendingAssistScorerId) {
              registerAssist(player.id)
              return
            }

            if (pendingReboundTeamId) {
              registerRebound(player.id)
              return
            }
            setSelectedPlayerId(player.id)
            setSelectedTeam(teamSide)
          }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${isDisqualified ? "bg-red-500 text-white" : "bg-muted"}`}>
                {player.jerseyNumber}
              </span>
              <div>
                <p className={`font-medium text-xs ${isDisqualified ? "text-red-700" : ""}`}>
                  {player.firstName} {player.lastName.charAt(0)}.
                  {isDisqualified && " ⛔"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {playerPoints} pts | {playerFouls} faltas
                </p>
              </div>
            </div>
          </div>
        </button>
        <div className="mt-1.5 flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 flex-1 text-xs font-medium px-2"
            onClick={() => {
              setPersonalFoulPlayerId(player.id)
              setPersonalFoulTeamSide(teamSide)
              setShowPersonalFoulDialog(true)
            }}
            disabled={!!pendingReboundTeamId || !!pendingAssistTeamId || !!pendingFreeThrow || isDisqualified}
          >
            Falta
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 text-[11px] font-medium px-2"
            onClick={() => {
              if (pendingReboundTeamId || pendingAssistTeamId || pendingFreeThrow) return
              setSelectedPlayerId(player.id)
              setSelectedTeam(teamSide)
              const rivalTeamId = teamSide === "home" ? awayTeam?.id : homeTeam?.id
              if (rivalTeamId) {
                const rivalFouls = localEvents.filter((e) => e.type === "foul" && e.teamId === rivalTeamId)
                if (rivalFouls.length > 0) {
                  const lastFoul = rivalFouls[rivalFouls.length - 1]
                  setSelectedFreeThrowFoulId(lastFoul.id)
                  const count = getFreeThrowCountForFoul(lastFoul)
                  setFreeThrowTotal(count)
                } else {
                  setSelectedFreeThrowFoulId(null)
                  setFreeThrowTotal(2)
                }
              } else {
                setSelectedFreeThrowFoulId(null)
                setFreeThrowTotal(2)
              }
              setFreeThrowDialogPlayer({
                id: player.id,
                jerseyNumber: (player as any).jerseyNumber ?? null,
                name: `${player.firstName} ${player.lastName}`,
                teamSide,
              })
              setFreeThrowAttempts({})
              setShowFreeThrowDialog(true)
            }}
            disabled={!!pendingReboundTeamId || !!pendingAssistTeamId || !!pendingFreeThrow}
          >
            Tiros Libres
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="flex items-center justify-between gap-3 p-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.push("/mesa")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="hidden sm:flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  syncStatus === "synced"
                    ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                    : syncStatus === "pending"
                      ? "bg-[var(--color-warning)]/10 text-[var(--color-warning)]"
                      : syncStatus === "syncing"
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                }`}
              >
                {syncStatus === "synced" && <CheckCircle className="h-3 w-3" />}
                {syncStatus === "pending" && <AlertTriangle className="h-3 w-3" />}
                {syncStatus === "syncing" && <Loader2 className="h-3 w-3 animate-spin" />}
                {syncStatus === "synced"
                  ? "Sincronizado"
                  : syncStatus === "pending"
                    ? "Pendiente"
                    : syncStatus === "syncing"
                      ? "Sincronizando"
                      : "Error"}
              </div>
              <div
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  isOnline ? "bg-[var(--color-success)]/10 text-[var(--color-success)]" : "bg-destructive/10 text-destructive"
                }`}
              >
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              {/* Local */}
              <div
                className="rounded-md border px-2 py-1.5"
                style={{ borderLeftColor: homeTeam.primaryColor, borderLeftWidth: 6 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground">LOCAL</div>
                    <div className="truncate text-sm font-semibold">{homeTeam.name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <span>Faltas:</span>
                      <div className={`px-1.5 py-0.5 rounded font-medium ${teamFoulWarning.home ? "bg-red-100 text-red-700" : "bg-muted"}`}>
                        {teamFoulsInPeriod.home}
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{homeScore}</div>
                </div>
              </div>

              {/* Reloj / Período */}
              <div className="text-center">
                <div className="text-xs text-muted-foreground">{periodLabel}</div>
                <div className="mt-0.5 flex items-center justify-center gap-2">
                  {isRunning ? (
                    <div className="text-2xl font-mono font-bold tabular-nums">{formatTime(gameTime)}</div>
                  ) : (
                    <Input
                      value={formatTime(gameTime)}
                      onChange={(e) => {
                        const v = e.target.value
                        const m = v.match(/^(\d{1,2}):(\d{2})$/)
                        if (!m) return
                        const mins = Number(m[1])
                        const secs = Number(m[2])
                        setGameTime(Math.max(0, mins * 60 + secs))
                      }}
                      className="h-9 w-[92px] text-center font-mono text-xl font-bold mx-auto"
                    />
                  )}

                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setIsRunning(!isRunning)}>
                    {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  {lastScoreFlash && (
                    <div
                      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-sm animate-in fade-in zoom-in duration-150"
                      style={{
                        backgroundColor: lastScoreFlash.teamSide === "home" ? homeTeam.primaryColor : awayTeam.primaryColor,
                      }}
                    >
                      +{lastScoreFlash.points}
                    </div>
                  )}
                </div>
              </div>

              {/* Visitante */}
              <div
                className="rounded-md border px-2 py-1.5"
                style={{ borderRightColor: awayTeam.primaryColor, borderRightWidth: 6 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-2xl font-bold tabular-nums">{awayScore}</div>
                  <div className="min-w-0 text-right">
                    <div className="truncate text-xs text-muted-foreground">VISITANTE</div>
                    <div className="truncate text-sm font-semibold">{awayTeam.name}</div>
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground mt-1">
                      <div className={`px-1.5 py-0.5 rounded font-medium ${teamFoulWarning.away ? "bg-red-100 text-red-700" : "bg-muted"}`}>
                        {teamFoulsInPeriod.away}
                      </div>
                      <span>Faltas:</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={undoLastAction} disabled={localEvents.length === 0}>
              <Undo2 className="h-4 w-4 mr-1" />
              Deshacer
            </Button>
            <Button
              variant={match.status === "en_juego" ? "destructive" : "secondary"}
              size="sm"
              disabled={match.status !== "en_juego"}
              onClick={() => (match.status === "en_juego" ? setShowEndDialog(true) : null)}
            >
              Finalizar
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="border-t px-2 py-2">
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)}>
            <TabsList className="flex w-full justify-start gap-1 overflow-x-auto whitespace-nowrap">
              <TabsTrigger className="shrink-0" value="cancha">
                Cancha
              </TabsTrigger>
              <TabsTrigger className="shrink-0" value="historial">
                Historial
              </TabsTrigger>
              <TabsTrigger className="shrink-0" value="otros">
                Otros
              </TabsTrigger>
              <TabsTrigger className="shrink-0" value="configuracion">
                Configuración
              </TabsTrigger>
              <TabsTrigger className="shrink-0" value="estadisticas">
                Estadísticas
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)} className="h-full">
          <TabsContent value="cancha" className="m-0 h-full">
            <div className="h-full grid grid-cols-1 gap-2 p-3 md:grid-cols-12">
              <div className="hidden md:block md:col-span-3 overflow-hidden">
                <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
                  <div className="px-3 py-2 text-sm font-semibold" style={{ borderLeftColor: homeTeam.primaryColor, borderLeftWidth: 6 }}>
                    {homeTeam.name}
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-2">
                    {homePlayers.map((player) => (
                      <PlayerButton key={player.id} player={player} teamSide="home" />
                    ))}
                  </div>
                </div>
              </div>

              <div className="md:col-span-6 h-full overflow-hidden">
                <div className="h-full rounded-lg border bg-card overflow-hidden flex flex-col">
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Cancha</div>
                      <div className="text-xs text-muted-foreground">
                        {pendingAssistTeamId && pendingAssistScorerId
                          ? "Asistencia pendiente: tocá un compañero para asignarla o seguí sin asistencia"
                          : selectedPlayerId
                            ? pendingReboundTeamId
                              ? "Rebote pendiente: tocá un jugador para asignarlo o continuá sin rebote"
                              : "Tap = tiro fallado | Mantener presionado = tiro convertido"
                            : "Seleccioná un jugador para habilitar el mapa"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!pendingFreeThrow && pendingAssistTeamId && pendingAssistScorerId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPendingAssistTeamId(null)
                            setPendingAssistScorerId(null)
                          }}
                        >
                          Sin asistencia
                        </Button>
                      )}
                      {!pendingFreeThrow && pendingReboundTeamId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPendingReboundTeamId(null)
                          }}
                        >
                          Sin rebote
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsRunning(false)
                          setShowAdvanceDialog(true)
                        }}
                      >
                        {period <= 4 ? "Cerrar Cuarto" : "Cerrar Prórroga"}
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-3">
                    <ShotMap
                      disabled={!selectedPlayerId || match.status !== "en_juego" || !!pendingReboundTeamId || !!pendingFreeThrow}
                      onShot={registerShot}
                    />
                  </div>
                  
                  {/* Botón de Otras Faltas debajo de la cancha */}
                  <div className="px-3 py-2 border-t">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowOtherFoulDialog(true)}
                      disabled={match.status !== "en_juego"}
                    >
                      Otras Faltas
                    </Button>
                  </div>
                </div>
              </div>

              <div className="md:hidden h-full overflow-hidden">
                <div className="h-full rounded-lg border bg-card overflow-hidden flex flex-col">
                  <div className="px-3 py-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={selectedTeam === "home" ? "secondary" : "outline"}
                      className="flex-1 justify-start"
                      onClick={() => setSelectedTeam("home")}
                      style={{ borderLeftColor: homeTeam.primaryColor, borderLeftWidth: 6 }}
                    >
                      {homeTeam.name}
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedTeam === "away" ? "secondary" : "outline"}
                      className="flex-1 justify-start"
                      onClick={() => setSelectedTeam("away")}
                      style={{ borderRightColor: awayTeam.primaryColor, borderRightWidth: 6 }}
                    >
                      {awayTeam.name}
                    </Button>
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-2">
                    {(selectedTeam === "home" ? homePlayers : awayPlayers).map((player) => (
                      <PlayerButton
                        key={player.id}
                        player={player}
                        teamSide={selectedTeam === "home" ? "home" : "away"}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="hidden md:block md:col-span-3 overflow-hidden">
                <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
                  <div className="px-3 py-2 text-sm font-semibold text-right" style={{ borderRightColor: awayTeam.primaryColor, borderRightWidth: 6 }}>
                    {awayTeam.name}
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-2">
                    {awayPlayers.map((player) => (
                      <PlayerButton key={player.id} player={player} teamSide="away" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="historial" className="m-0 h-full overflow-auto p-3">
            <div className="rounded-lg border bg-card">
              <div className="border-b px-3 py-2 text-sm font-semibold">Historial</div>
              <div className="p-3">
                {localEvents.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Todavía no hay eventos registrados.</div>
                ) : (
                  <div className="space-y-2">
                    {localEvents
                      .slice()
                      .reverse()
                      .map((e) => {
                        const player = [...homePlayers, ...awayPlayers].find((p) => p.id === e.playerId)
                        const isHome = e.teamId === homeTeam.id
                        const teamName = isHome ? homeTeam.name : awayTeam.name
                        
                        // Manejar nombres para personal técnico
                        let personName = ""
                        if (e.foulType === "technical" && e.playerId.startsWith("tech-")) {
                          personName = "Técnico"
                        } else if (e.foulType === "technical" && e.playerId.startsWith("assist-")) {
                          personName = "Asistente"
                        } else if (player) {
                          personName = `${player.lastName.toUpperCase()}, ${player.firstName}`
                        }
                        const title =
                          e.type === "points"
                            ? `+${e.points}`
                            : e.type === "shot"
                              ? `${e.made ? "Anotó" : "Falló"} ${e.shotType}P`
                              : e.type === "free_throw"
                                ? `${e.made ? "Anotó" : "Falló"} TL`
                                : e.type === "rebound"
                                  ? `Rebote ${e.reboundType === "offensive" ? "O" : "D"}`
                                  : e.type === "foul"
                                    ? (() => {
                                        const type = e.foulType
                                        if (type === "technical") return "Falta Técnica"
                                        if (type === "unsportsmanlike") return "Falta Antideportiva"
                                        if (type === "disqualifying") return "Falta Descalificante"
                                        if (type === "fight") return "Reyerta"
                                        return "Falta Personal"
                                      })()
                                    : e.type

                        return (
                          <div key={e.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{title}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {e.gameTime} | {teamName}
                                {personName && ` | ${personName}`}
                              </div>
                            </div>
                            <div
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: isHome ? homeTeam.primaryColor : awayTeam.primaryColor }}
                            />
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="otros" className="m-0 h-full overflow-auto p-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border bg-card">
                <div className="border-b px-3 py-2 text-sm font-semibold">Partido</div>
                <div className="p-3 space-y-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => {
                      setIsRunning(false)
                      setShowAdvanceDialog(true)
                    }}
                  >
                    {period <= 4 ? "Cerrar Cuarto" : "Cerrar Prórroga"}
                  </Button>
                  <Button
                    className="w-full"
                    variant={match.status === "en_juego" ? "destructive" : "secondary"}
                    disabled={match.status !== "en_juego"}
                    onClick={() => (match.status === "en_juego" ? setShowEndDialog(true) : null)}
                  >
                    {match.status === "en_juego" ? "Finalizar Partido" : "Esperando que el árbitro inicie"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="configuracion" className="m-0 h-full overflow-auto p-3">
            <div className="rounded-lg border bg-card">
              <div className="border-b px-3 py-2 text-sm font-semibold">Configuración</div>
              <div className="p-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">Reloj</div>
                  <div className="text-xs text-muted-foreground">Editar cuando está detenido</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={formatTime(gameTime)}
                      onChange={(e) => {
                        const v = e.target.value
                        const m = v.match(/^(\d{1,2}):(\d{2})$/)
                        if (!m) return
                        const mins = Number(m[1])
                        const secs = Number(m[2])
                        setGameTime(Math.max(0, mins * 60 + secs))
                      }}
                      className="h-10 w-[120px] text-center font-mono text-xl font-bold"
                      disabled={isRunning}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setGameTime(getPeriodDurationSeconds(period))
                        setIsRunning(false)
                      }}
                    >
                      Reiniciar
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">Acciones</div>
                  <div className="mt-2 grid gap-2">
                    <Button variant="outline" onClick={undoLastAction} disabled={localEvents.length === 0}>
                      Deshacer
                    </Button>
                    <Button
                      variant={match.status === "en_juego" ? "destructive" : "secondary"}
                      disabled={match.status !== "en_juego"}
                      onClick={() => (match.status === "en_juego" ? setShowEndDialog(true) : null)}
                    >
                      Finalizar Partido
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="estadisticas" className="m-0 h-full overflow-auto p-3">
            <div className="rounded-lg border bg-card">
              <div className="border-b px-3 py-2 text-sm font-semibold">Estadísticas</div>
              <div className="p-3 text-sm text-muted-foreground">Sección en preparación.</div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* End Match Dialog */}
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar Partido</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="my-4">
                <div className="flex items-center justify-center gap-8 text-foreground">
                  <div className="text-center">
                    <div className="font-semibold">{homeTeam.name}</div>
                    <div className="text-4xl font-bold">{homeScore}</div>
                  </div>
                  <span className="text-2xl text-muted-foreground">-</span>
                  <div className="text-center">
                    <div className="font-semibold">{awayTeam.name}</div>
                    <div className="text-4xl font-bold">{awayScore}</div>
                  </div>
                </div>
                <div className="text-center mt-4 text-sm">
                  ¿Confirmas que deseas finalizar el partido con este resultado?
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar Partido</AlertDialogCancel>
            <AlertDialogAction onClick={endMatch}>Confirmar y Finalizar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{period <= 4 ? "Finalizó el cuarto" : "Finalizó la prórroga"}</AlertDialogTitle>
            <AlertDialogDescription>
              {period < 4
                ? `¿Continuar al Período ${period + 1}?`
                : `¿Continuar a ${period === 4 ? "Prórroga 1" : `Prórroga ${period - 3}`}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowAdvanceDialog(false)
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const nextPeriod = period + 1
                setPeriod(nextPeriod)
                setGameTime(getPeriodDurationSeconds(nextPeriod))
                setShowAdvanceDialog(false)
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={showFreeThrowDialog}
        onOpenChange={(open) => {
          if (!open) {
            if (pendingFreeThrow && Object.keys(freeThrowAttempts).length === 0) {
              setPendingFreeThrow(null)
            }
            setShowFreeThrowDialog(false)
            setFreeThrowAttempts({})
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tiros Libres</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Situación</div>
              <Select
                value={selectedFreeThrowFoulId ?? undefined}
                onValueChange={(value) => {
                  setSelectedFreeThrowFoulId(value)
                  const foul = opponentFoulsForFreeThrows.find((f) => f.id === value)
                  if (foul) {
                    setFreeThrowTotal(getFreeThrowCountForFoul(foul))
                  }
                }}
                disabled={opponentFoulsForFreeThrows.length === 0}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue
                    placeholder={
                      opponentFoulsForFreeThrows.length === 0
                        ? "Sin faltas del equipo rival todavía"
                        : "Elegí la falta que origina los tiros libres"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {opponentFoulsForFreeThrows.map((foul) => {
                    const player = [...homePlayers, ...awayPlayers].find((p) => p.id === foul.playerId)
                    const jersey = player?.jerseyNumber ? `#${player.jerseyNumber} ` : ""
                    const name = player ? `${player.firstName} ${player.lastName}` : "Jugador desconocido"
                    const base = `${jersey}${name} ${foul.gameTime ?? ""}`
                    const foulTypeLabel =
                      foul.foulType === "technical"
                        ? "TECNICA"
                        : foul.foulType === "unsportsmanlike"
                          ? "ANTIDEPORTIVA"
                          : "PERSONAL"
                    const label = `${base} – ${foulTypeLabel}`
                    return (
                      <SelectItem key={foul.id} value={foul.id} className="text-xs">
                        {label}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-sm">
              {[1, 2, 3].map((n) => {
                const prevAllSet = [1, 2, 3]
                  .slice(0, n - 1)
                  .every((k) => !!freeThrowAttempts[k as 1 | 2 | 3])
                const isEnabled = n <= freeThrowTotal && prevAllSet
                const label = `Tiro ${n}`
                const state = freeThrowAttempts[n as 1 | 2 | 3]
                return (
                  <div key={n} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-xs text-muted-foreground">{label}</span>
                      {state && (
                        <span className="text-xs font-medium text-muted-foreground">
                          {state === "made" ? "Anotado" : "Fallado"}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant={state === "made" ? "outline" : "outline"}
                        className={
                          state === "made"
                            ? "border-emerald-500 bg-emerald-500 text-emerald-50 hover:bg-emerald-600 hover:border-emerald-600"
                            : ""
                        }
                        disabled={!isEnabled}
                        onClick={() => {
                          setFreeThrowAttempts((prev) => ({ ...prev, [n]: "made" }))
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={state === "missed" ? "destructive" : "outline"}
                        disabled={!isEnabled}
                        onClick={() => {
                          setFreeThrowAttempts((prev) => ({ ...prev, [n]: "missed" }))
                        }}
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                  </div>
                  </div>
                )
              })}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                // Cierra sin aplicar nada al marcador
                setShowFreeThrowDialog(false)
                setFreeThrowAttempts({})
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const sequence: ("made" | "missed")[] = []
                ;[1, 2, 3].forEach((n) => {
                  const s = freeThrowAttempts[n as 1 | 2 | 3]
                  if (s && sequence.length < freeThrowTotal) sequence.push(s)
                })
                if (sequence.length === 0 || !freeThrowDialogPlayer) {
                  setShowFreeThrowDialog(false)
                  setFreeThrowAttempts({})
                  return
                }

                // Jugador y equipo del tirador desde el diálogo
                const playerTeam = getPlayerTeam(freeThrowDialogPlayer.id)
                if (!playerTeam) {
                  setShowFreeThrowDialog(false)
                  setFreeThrowAttempts({})
                  return
                }

                // Limpiamos cualquier rebote pendiente anterior antes de esta serie
                setPendingReboundTeamId(null)

                // Inicializamos directamente la serie de tiros libres
                setPendingFreeThrow({
                  playerId: freeThrowDialogPlayer.id,
                  teamId: playerTeam.teamId,
                  teamSide: playerTeam.teamSide,
                  total: sequence.length as 1 | 2 | 3,
                  current: 1,
                })

                // Aplicar intents secuencialmente con un pequeño delay para respetar el flujo
                sequence.forEach((s, idx) => {
                  window.setTimeout(() => {
                    registerFreeThrowAttempt(s === "made")
                  }, idx * 40)
                })

                setShowFreeThrowDialog(false)
                setFreeThrowAttempts({})
              }}
            >
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Faltas Personales */}
      <Dialog open={showPersonalFoulDialog} onOpenChange={setShowPersonalFoulDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Falta Personal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground mb-2">
                Jugador que cometió la falta:{" "}
                {personalFoulPlayerId && (() => {
                  const player = [...homePlayers, ...awayPlayers].find(p => p.id === personalFoulPlayerId)
                  return player ? `${player.firstName} ${player.lastName}` : ""
                })()}
              </div>
            </div>
            
            {/* Información sobre tiros libres por infracción de equipo */}
            {personalFoulTeamSide && (
              <div className={`p-2 rounded text-xs ${teamFoulWarning[personalFoulTeamSide] ? "bg-red-50 text-red-700 border border-red-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                {teamFoulWarning[personalFoulTeamSide] 
                  ? `⚠️ Equipo en infracción: ${teamFoulsInPeriod[personalFoulTeamSide]}/5 faltas. Próxima falta = 2 tiros libres`
                  : `Equipo con ${teamFoulsInPeriod[personalFoulTeamSide]}/4 faltas. A las 4 faltas entra en infracción`
                }
              </div>
            )}
            
            <div>
              <div className="text-xs text-muted-foreground mb-1">Seleccionar jugador rival que recibió la falta</div>
              <div className="space-y-2 max-h-60 overflow-auto">
                {(personalFoulTeamSide === "home" ? awayPlayers : homePlayers).map((player) => (
                  <Button
                    key={player.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      if (personalFoulPlayerId && personalFoulTeamSide) {
                        addFoul(personalFoulPlayerId, personalFoulTeamSide, "personal")
                        setShowPersonalFoulDialog(false)
                        setPersonalFoulPlayerId(null)
                        setPersonalFoulTeamSide(null)
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center font-bold text-xs">
                        {player.jerseyNumber}
                      </span>
                      <span className="text-sm">
                        {player.firstName} {player.lastName}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowPersonalFoulDialog(false)
              setPersonalFoulPlayerId(null)
              setPersonalFoulTeamSide(null)
            }}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Otras Faltas */}
      <Dialog open={showOtherFoulDialog} onOpenChange={setShowOtherFoulDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Otras Faltas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Paso 1: Seleccionar tipo de falta */}
            <div>
              <div className="text-sm font-semibold mb-2">Tipo de falta</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedFoulType === "unsportsmanlike" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFoulType("unsportsmanlike")}
                >
                  Antideportiva
                </Button>
                <Button
                  variant={selectedFoulType === "disqualifying" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFoulType("disqualifying")}
                >
                  Descalificante
                </Button>
                <Button
                  variant={selectedFoulType === "fight" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFoulType("fight")}
                >
                  Reyerta
                </Button>
                <Button
                  variant={selectedFoulType === "technical" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFoulType("technical")}
                >
                  Técnica
                </Button>
              </div>
            </div>

            {/* Paso 2: Seleccionar equipo */}
            <div>
              <div className="text-sm font-semibold mb-2">Equipo</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedFoulTeam === "home" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFoulTeam("home")}
                  style={selectedFoulTeam === "home" ? { backgroundColor: homeTeam?.primaryColor } : {}}
                  disabled={!homeTeam}
                >
                  {homeTeam?.name || "Local"}
                </Button>
                <Button
                  variant={selectedFoulTeam === "away" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFoulTeam("away")}
                  style={selectedFoulTeam === "away" ? { backgroundColor: awayTeam?.primaryColor } : {}}
                  disabled={!awayTeam}
                >
                  {awayTeam?.name || "Visitante"}
                </Button>
              </div>
            </div>

            {/* Paso 3: Seleccionar persona */}
            <div>
              <div className="text-sm font-semibold mb-2">
                {selectedFoulType === "unsportsmanlike" || selectedFoulType === "disqualifying" || selectedFoulType === "fight" 
                  ? "Jugadores y Personal Técnico" 
                  : selectedFoulType === "technical" 
                    ? "Jugadores y Personal Técnico" 
                    : "Jugadores"
                }
              </div>
              
              {/* Mostrar jugadores para todos los tipos de falta excepto personal */}
              {selectedFoulType !== "technical" && selectedFoulType !== "unsportsmanlike" && selectedFoulType !== "disqualifying" && selectedFoulType !== "fight" ? (
                // Faltas personales: solo jugadores
                <div className="space-y-1 max-h-48 overflow-auto">
                  {(selectedFoulTeam === "home" ? homePlayers : awayPlayers).map((player) => (
                    <Button
                      key={player.id}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        addFoul(player.id, selectedFoulTeam, selectedFoulType)
                        setShowOtherFoulDialog(false)
                      }}
                      disabled={isPlayerDisqualified(player.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-center font-medium">{player.jerseyNumber}</span>
                        <span>{player.lastName.toUpperCase()}, {player.firstName}</span>
                      </div>
                    </Button>
                  ))}
                </div>
              ) : (
                // Faltas técnicas, antideportivas, descalificantes y por reyerta: jugadores + staff
                <div className="space-y-2">
                  {/* Sección de Jugadores */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Jugadores</div>
                    <div className="space-y-1 max-h-32 overflow-auto">
                      {(selectedFoulTeam === "home" ? homePlayers : awayPlayers).map((player) => (
                        <Button
                          key={player.id}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs"
                          onClick={() => {
                            addFoul(player.id, selectedFoulTeam, selectedFoulType)
                            setShowOtherFoulDialog(false)
                          }}
                          disabled={isPlayerDisqualified(player.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-6 text-center font-medium">{player.jerseyNumber}</span>
                            <span>{player.lastName.toUpperCase()}, {player.firstName}</span>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Sección de Personal Técnico (excepto para antideportivas) */}
                  {selectedFoulType !== "unsportsmanlike" && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Personal Técnico</div>
                      {(() => {
                        const selectedStaff = getSelectedStaff()
                        const staffIds = selectedFoulTeam === "home" ? selectedStaff.homeStaff : selectedStaff.awayStaff
                        
                        if (staffIds.length === 0) {
                          return (
                            <p className="text-xs text-muted-foreground">
                              No hay personal técnico seleccionado en la pre planilla
                            </p>
                          )
                        }
                        
                        return staffIds.map((staffId: string) => {
                          const staff = staffData[staffId]
                          if (!staff) return null
                          
                          const isTechnical = staff.role === "tecnico"
                          const staffType = isTechnical ? "tech" : "assist"
                          const staffIdFull = `${staffType}-${selectedFoulTeam === "home" ? homeTeam?.id : awayTeam?.id}`
                          
                          return (
                            <Button
                              key={staff.id}
                              variant="outline"
                              className="w-full justify-start text-xs"
                              onClick={() => {
                                if (homeTeam && awayTeam) {
                                  addFoul(staffIdFull, selectedFoulTeam, selectedFoulType)
                                  setShowOtherFoulDialog(false)
                                }
                              }}
                              disabled={!homeTeam || !awayTeam}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-primary">
                                  {isTechnical ? "DT" : "AS"}
                                </span>
                                <span>
                                  {staff.last_name.toUpperCase()}, {staff.first_name}
                                </span>
                              </div>
                            </Button>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOtherFoulDialog(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ShotMap({
  disabled,
  onShot,
}: {
  disabled: boolean
  onShot: (x: number, y: number, made: boolean) => void
}) {
  const [pressTimeoutId, setPressTimeoutId] = useState<number | null>(null)
  const [pressPos, setPressPos] = useState<{ x: number; y: number } | null>(null)
  const [longPressTriggered, setLongPressTriggered] = useState(false)

  const clearPressTimeout = () => {
    if (pressTimeoutId) window.clearTimeout(pressTimeoutId)
    setPressTimeoutId(null)
  }

  const computePos = (el: HTMLElement, clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    return { x, y }
  }

  const mapToModelCoords = (pos: { x: number; y: number }) => {
    return { x: 1 - pos.y, y: pos.x }
  }

  return (
    <div className={`mx-auto w-full max-w-[980px] select-none ${disabled ? "opacity-60" : ""}`}>
      <div className="rounded-xl bg-[#1f4aa8] p-2 shadow-sm">
        <div
          className="relative w-full rounded-lg"
          style={{ aspectRatio: "28 / 15" }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if (disabled) return
            const el = e.currentTarget as unknown as HTMLElement
            const pos = computePos(el, e.clientX, e.clientY)
            setPressPos(pos)
            setLongPressTriggered(false)

            const modelPos = mapToModelCoords(pos)

            const id = window.setTimeout(() => {
              setLongPressTriggered(true)
              onShot(modelPos.x, modelPos.y, true)
            }, 380)
            setPressTimeoutId(id)
          }}
          onPointerUp={() => {
            if (disabled) return
            if (!pressPos) return

            clearPressTimeout()
            if (!longPressTriggered) {
              const modelPos = mapToModelCoords(pressPos)
              onShot(modelPos.x, modelPos.y, false)
            }
            setPressPos(null)
          }}
          onPointerCancel={() => {
            clearPressTimeout()
            setPressPos(null)
          }}
        >
          <div className="absolute inset-0 overflow-hidden rounded-lg bg-[repeating-linear-gradient(90deg,#d9b47d_0px,#d9b47d_24px,#d0aa74_24px,#d0aa74_48px)]">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.06)_36%,rgba(0,0,0,0.05)_100%)]" />
            <svg
              className="absolute inset-0 pointer-events-none"
              viewBox="0 0 1000 536"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line x1="500" y1="18" x2="500" y2="518" stroke="rgba(255,255,255,0.95)" strokeWidth="6" />
              <circle cx="500" cy="268" r="110" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="6" />

              <g>
                <rect x="18" y="158" width="190" height="220" fill="#2a5bd7" fillOpacity="0.95" stroke="rgba(255,255,255,0.95)" strokeWidth="6" />
                <line x1="208" y1="158" x2="208" y2="378" stroke="rgba(255,255,255,0.95)" strokeWidth="6" />
                <path d="M 208 208 A 60 60 0 0 1 208 328" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="6" />
                <circle cx="55" cy="268" r="7" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="3" />
                <line x1="18" y1="52" x2="200" y2="52" stroke="rgba(255,255,255,0.9)" strokeWidth="6" />
                <line x1="18" y1="484" x2="200" y2="484" stroke="rgba(255,255,255,0.9)" strokeWidth="6" />
                <path d="M 200 52 A 260 260 0 0 1 200 484" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="6" />
              </g>

              <g transform="translate(1000 0) scale(-1 1)">
                <rect x="18" y="158" width="190" height="220" fill="#2a5bd7" fillOpacity="0.95" stroke="rgba(255,255,255,0.95)" strokeWidth="6" />
                <line x1="208" y1="158" x2="208" y2="378" stroke="rgba(255,255,255,0.95)" strokeWidth="6" />
                <path d="M 208 208 A 60 60 0 0 1 208 328" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="6" />
                <circle cx="55" cy="268" r="7" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="3" />
                <line x1="18" y1="52" x2="200" y2="52" stroke="rgba(255,255,255,0.9)" strokeWidth="6" />
                <line x1="18" y1="484" x2="200" y2="484" stroke="rgba(255,255,255,0.9)" strokeWidth="6" />
                <path d="M 200 52 A 260 260 0 0 1 200 484" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="6" />
              </g>

              <rect x="18" y="18" width="964" height="500" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="10" />
            </svg>

            {pressPos && !disabled && (
              <div
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600"
                style={{ left: `${pressPos.x * 100}%`, top: `${pressPos.y * 100}%` }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
