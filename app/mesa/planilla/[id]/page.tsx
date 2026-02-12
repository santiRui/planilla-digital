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

// Tipos auxiliares para filas de Supabase
type MatchRow = {
  id: string
  home_team_id: string
  away_team_id: string
  status: "programado" | "en_juego" | "finalizado"
  home_score: number | null
  away_score: number | null
}

type TeamRow = {
  id: string
  name: string
  primary_color: string | null
}

type PersistedMatchState = {
  homeScore: number
  awayScore: number
  period: number
  gameTime: number
  isRunning: boolean
  selectedTeam: "home" | "away"
  selectedPlayerId: string | null
  pendingReboundTeamId: string | null
  pendingPersonalFoul: {
    committerId: string
    committerTeamSide: "home" | "away"
    targetTeamSide: "home" | "away"
  } | null
  pendingBlock: {
    blockerId: string
    blockerTeamSide: "home" | "away"
    targetTeamSide: "home" | "away"
  } | null
  pendingTurnover: {
    loserId: string
    loserTeamSide: "home" | "away"
    targetTeamSide: "home" | "away"
  } | null
  pendingAssistTeamId: string | null
  pendingAssistScorerId: string | null
  pendingFreeThrow: {
    playerId: string
    teamId: string
    teamSide: "home" | "away"
    total: 1 | 2 | 3
    current: number
  } | null
  lastScoreFlash: { teamSide: "home" | "away"; points: 2 | 3 } | null
  localEvents: MatchEvent[]
  mainTab: "cancha" | "historial" | "otros" | "configuracion" | "estadisticas"
  onCourtPlayers: { home: string[]; away: string[] }
  timeoutDialogTeamSide: "home" | "away" | null
  timeoutTeamSide: "home" | "away" | null
  timeoutCountdown: number | null
  timeoutMinimized: boolean
  homeColorOverride: string | null
  awayColorOverride: string | null
  showClockEditor: boolean
  pendingEventIds: string[]
  pendingDeleteEventIds: string[]
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
        .maybeSingle<MatchRow>()

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
          .maybeSingle<TeamRow>(),
        supabase
          .from("teams")
          .select("id, name, primary_color")
          .eq("id", mappedMatch.awayTeamId)
          .maybeSingle<TeamRow>(),
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
  
  // Jugadores disponibles para el partido (titulares + banco) según pre planilla
  const homePlayers = useMemo(() => {
    const allPlayers = storeMatch ? storeHomePlayers : dbHomePlayers
    if (!prePlanillaData || !prePlanillaData.home?.selectedPlayerIds?.length) {
      // Sin pre planilla o sin selección: usar todos los jugadores del equipo
      return allPlayers
    }

    return allPlayers.filter((player) => prePlanillaData.home.selectedPlayerIds.includes(player.id))
  }, [storeMatch, storeHomePlayers, dbHomePlayers, prePlanillaData])

  const awayPlayers = useMemo(() => {
    const allPlayers = storeMatch ? storeAwayPlayers : dbAwayPlayers
    if (!prePlanillaData || !prePlanillaData.away?.selectedPlayerIds?.length) {
      return allPlayers
    }

    return allPlayers.filter((player) => prePlanillaData.away.selectedPlayerIds.includes(player.id))
  }, [storeMatch, storeAwayPlayers, dbAwayPlayers, prePlanillaData])

  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [restoredFromStorage, setRestoredFromStorage] = useState(false)
  const [period, setPeriod] = useState(1)
  const [gameTime, setGameTime] = useState(() => {
    if (typeof window === "undefined") return 10 * 60
    try {
      const raw = window.localStorage.getItem(`planilla-state:${matchId}`)
      if (!raw) return 10 * 60
      const data = JSON.parse(raw) as Partial<PersistedMatchState>
      return typeof data.gameTime === "number" ? data.gameTime : 10 * 60
    } catch {
      return 10 * 60
    }
  }) // in seconds
  const [isRunning, setIsRunning] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<"home" | "away">("home")
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [pendingReboundTeamId, setPendingReboundTeamId] = useState<string | null>(null)
  // Falta personal: selección pendiente del jugador que la recibe (ya sabemos quién la comete)
  const [pendingPersonalFoul, setPendingPersonalFoul] = useState<
    { committerId: string; committerTeamSide: "home" | "away"; targetTeamSide: "home" | "away" } | null
  >(null)
  // Tapa: selección pendiente del jugador rival que recibe la tapa
  const [pendingBlock, setPendingBlock] = useState<
    { blockerId: string; blockerTeamSide: "home" | "away"; targetTeamSide: "home" | "away" } | null
  >(null)
  // Pérdida/Recuperación: jugador que pierde la pelota y rival que recupera (opcional)
  const [pendingTurnover, setPendingTurnover] = useState<
    { loserId: string; loserTeamSide: "home" | "away"; targetTeamSide: "home" | "away" } | null
  >(null)
  const [pendingAssistTeamId, setPendingAssistTeamId] = useState<string | null>(null)
  const [pendingAssistScorerId, setPendingAssistScorerId] = useState<string | null>(null)
  const [pendingFreeThrow, setPendingFreeThrow] = useState<
    { playerId: string; teamId: string; teamSide: "home" | "away"; total: 1 | 2 | 3; current: number } | null
  >(null)
  const [lastScoreFlash, setLastScoreFlash] = useState<{ teamSide: "home" | "away"; points: 2 | 3 } | null>(null)
  const [pendingDeleteEventIds, setPendingDeleteEventIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = window.localStorage.getItem(`planilla-state:${matchId}`)
      if (!raw) return []
      const data = JSON.parse(raw) as Partial<PersistedMatchState>
      return data.pendingDeleteEventIds ?? []
    } catch {
      return []
    }
  })
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
  const [pendingEventIds, setPendingEventIds] = useState<string[]>([])
  const [mainTab, setMainTab] = useState<"cancha" | "historial" | "otros" | "configuracion" | "estadisticas">("cancha")
  // Sustituciones: jugadores en cancha y diálogo
  const [onCourtPlayers, setOnCourtPlayers] = useState<{ home: string[]; away: string[] }>({ home: [], away: [] })
  const [showSubsDialog, setShowSubsDialog] = useState(false)
  const [subsDialogTeamSide, setSubsDialogTeamSide] = useState<"home" | "away">("home")
  const [subsSelection, setSubsSelection] = useState<string[]>([])
  // Tiempo muerto: diálogo de confirmación y cuenta regresiva de 60s
  const [timeoutDialogTeamSide, setTimeoutDialogTeamSide] = useState<"home" | "away" | null>(null)
  const [timeoutTeamSide, setTimeoutTeamSide] = useState<"home" | "away" | null>(null)
  const [timeoutCountdown, setTimeoutCountdown] = useState<number | null>(null)
  const [timeoutMinimized, setTimeoutMinimized] = useState(false)
  // Overrides de color solo para este partido
  const [homeColorOverride, setHomeColorOverride] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = window.localStorage.getItem(`planilla-state:${matchId}`)
      if (!raw) return null
      const data = JSON.parse(raw) as Partial<PersistedMatchState>
      return (data.homeColorOverride as string | null | undefined) ?? null
    } catch {
      return null
    }
  })
  const [awayColorOverride, setAwayColorOverride] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = window.localStorage.getItem(`planilla-state:${matchId}`)
      if (!raw) return null
      const data = JSON.parse(raw) as Partial<PersistedMatchState>
      return (data.awayColorOverride as string | null | undefined) ?? null
    } catch {
      return null
    }
  })
  const [showClockEditor, setShowClockEditor] = useState(false)
  const [showClockEditorWarning, setShowClockEditorWarning] = useState(false)
  
  // Estados para faltas
  const [showPersonalFoulDialog, setShowPersonalFoulDialog] = useState(false)
  const [showOtherFoulDialog, setShowOtherFoulDialog] = useState(false)
  const [personalFoulPlayerId, setPersonalFoulPlayerId] = useState<string | null>(null)
  const [personalFoulTeamSide, setPersonalFoulTeamSide] = useState<"home" | "away" | null>(null)
  const [selectedFoulType, setSelectedFoulType] = useState<
    "unsportsmanlike" | "disqualifying" | "fight" | "technical"
  >("unsportsmanlike")
  const [selectedFoulTeam, setSelectedFoulTeam] = useState<"home" | "away">("home")
  const [teamFoulWarning, setTeamFoulWarning] = useState<{ home: boolean; away: boolean }>({ home: false, away: false })

  // Colores efectivos para este partido (base de equipo + override local)
  const homeColor = homeColorOverride ?? homeTeam?.primaryColor ?? "#666"
  const awayColor = awayColorOverride ?? awayTeam?.primaryColor ?? "#666"

  // Enviar un evento individual al backend cuando haya conexión
  const sendEventToServer = useCallback(
    async (event: MatchEvent): Promise<boolean> => {
      if (!isOnline) {
        console.log("[events] Skipping send, offline", { id: event.id, type: event.type })
        return false
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) {
          return false
        }

        const res = await fetch(`/api/mesa/matches/${matchId}/events`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            event: {
              ...event,
              timestamp: event.timestamp.toISOString(),
            },
          }),
        })

        if (!res.ok) return false

        return true
      } catch {
        // Si falla, dejamos que la persistencia local sea la fuente de verdad
        return false
      }
    },
    [isOnline, supabase, matchId],
  )

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

      const rows = (data ?? []) as {
        id: string
        team_id: string
        first_name: string
        last_name: string
        role: string
      }[]

      if (rows.length) {
        const staffMap: Record<string, any> = {}
        rows.forEach((staff) => {
          staffMap[staff.id] = staff
        })
        setStaffData(staffMap)
      }
    }
    
    loadStaffData()
  }, [homeTeam, awayTeam, prePlanillaData])

  // Inicializar jugadores en cancha desde pre planilla o primeros 5
  useEffect(() => {
    if (!homePlayers.length && !awayPlayers.length) return

    setOnCourtPlayers((prev) => {
      if (prev.home.length || prev.away.length) return prev

      const homeBase = homePlayers.map((p) => p.id)
      const awayBase = awayPlayers.map((p) => p.id)

      const homeInitial =
        prePlanillaData?.home?.starters?.length
          ? prePlanillaData.home.starters
          : homeBase.slice(0, 5)

      const awayInitial =
        prePlanillaData?.away?.starters?.length
          ? prePlanillaData.away.starters
          : awayBase.slice(0, 5)

      return {
        home: homeInitial,
        away: awayInitial,
      }
    })
  }, [homePlayers, awayPlayers, prePlanillaData])

  // Restaurar estado del partido desde localStorage (si existe)
  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(`planilla-state:${matchId}`)
    if (!raw) return

    try {
      const data = JSON.parse(raw) as PersistedMatchState

      setHomeScore(data.homeScore)
      setAwayScore(data.awayScore)
      setPeriod(data.period)
      setGameTime(data.gameTime)
      setIsRunning(data.isRunning)
      setSelectedTeam(data.selectedTeam)
      setSelectedPlayerId(data.selectedPlayerId)
      setPendingReboundTeamId(data.pendingReboundTeamId)
      setPendingPersonalFoul(data.pendingPersonalFoul)
      setPendingBlock(data.pendingBlock)
      setPendingTurnover(data.pendingTurnover)
      setPendingAssistTeamId(data.pendingAssistTeamId)
      setPendingAssistScorerId(data.pendingAssistScorerId)
      setPendingFreeThrow(data.pendingFreeThrow)
      setLastScoreFlash(data.lastScoreFlash)

      const restoredEvents = (data.localEvents ?? []).map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }))
      setLocalEvents(restoredEvents)
      setPendingEventIds(data.pendingEventIds ?? [])
      setPendingDeleteEventIds(data.pendingDeleteEventIds ?? [])

      // Recalcular marcador a partir del historial por si los campos de score no son fiables
      if (restoredEvents.length > 0) {
        let restoredHomeScore = 0
        let restoredAwayScore = 0

        restoredEvents.forEach((ev) => {
          const isHome = ev.teamId === homeTeam?.id

          if (ev.type === "points" && ev.points) {
            if (isHome) restoredHomeScore += ev.points
            else restoredAwayScore += ev.points
          }

          if (ev.type === "shot" && ev.made && ev.shotType) {
            if (isHome) restoredHomeScore += ev.shotType
            else restoredAwayScore += ev.shotType
          }

          if (ev.type === "free_throw" && ev.made) {
            if (isHome) restoredHomeScore += 1
            else restoredAwayScore += 1
          }
        })

        setHomeScore(restoredHomeScore)
        setAwayScore(restoredAwayScore)
      }

      setMainTab(data.mainTab)
      setOnCourtPlayers(data.onCourtPlayers)
      setTimeoutDialogTeamSide(data.timeoutDialogTeamSide)
      setTimeoutTeamSide(data.timeoutTeamSide)
      setTimeoutCountdown(data.timeoutCountdown)
      setTimeoutMinimized(data.timeoutMinimized)
      setHomeColorOverride(data.homeColorOverride)
      setAwayColorOverride(data.awayColorOverride)
      setShowClockEditor(data.showClockEditor)
      setRestoredFromStorage(true)
    } catch {
      // Si hay datos corruptos, los ignoramos
    }
  }, [matchId])

  // Guardar estado del partido en localStorage en cada cambio relevante
  useEffect(() => {
    if (typeof window === "undefined") return
    const payload: PersistedMatchState = {
      homeScore,
      awayScore,
      period,
      gameTime,
      isRunning,
      selectedTeam,
      selectedPlayerId,
      pendingReboundTeamId,
      pendingPersonalFoul,
      pendingBlock,
      pendingTurnover,
      pendingAssistTeamId,
      pendingAssistScorerId,
      pendingFreeThrow,
      lastScoreFlash,
      localEvents,
      mainTab,
      onCourtPlayers,
      timeoutDialogTeamSide,
      timeoutTeamSide,
      timeoutCountdown,
      timeoutMinimized,
      homeColorOverride,
      awayColorOverride,
      showClockEditor,
      pendingEventIds,
      pendingDeleteEventIds,
    }

    try {
      window.localStorage.setItem(`planilla-state:${matchId}`, JSON.stringify(payload))
    } catch {
      // Ignorar errores de almacenamiento (p.ej. quota excedida)
    }
  }, [
    matchId,
    homeScore,
    awayScore,
    period,
    gameTime,
    isRunning,
    selectedTeam,
    selectedPlayerId,
    pendingReboundTeamId,
    pendingPersonalFoul,
    pendingBlock,
    pendingTurnover,
    pendingAssistTeamId,
    pendingAssistScorerId,
    pendingFreeThrow,
    lastScoreFlash,
    localEvents,
    mainTab,
    onCourtPlayers,
    timeoutDialogTeamSide,
    timeoutTeamSide,
    timeoutCountdown,
    timeoutMinimized,
    homeColorOverride,
    awayColorOverride,
    showClockEditor,
    pendingEventIds,
  ])

  // Reintentar subir eventos pendientes cuando volvemos a estar online
  useEffect(() => {
    if (!isOnline) return
    if (!pendingEventIds.length) return

    const retryPending = async () => {
      console.log("[events] Retry pending events start", { pendingEventIds })
      const eventsToRetry = localEvents.filter((e) => pendingEventIds.includes(e.id))
      if (!eventsToRetry.length) {
        console.log("[events] No local events found for pending ids, clearing queue")
        setPendingEventIds([])
        return
      }

      const succeeded: string[] = []
      for (const ev of eventsToRetry) {
        try {
          const ok = await sendEventToServer(ev)
          if (ok) {
            succeeded.push(ev.id)
          } else {
            console.warn("[events] Retry send failed, will keep pending", { id: ev.id })
          }
        } catch {
          // se queda pendiente
          console.error("[events] Retry send threw error", { id: ev.id })
        }
      }

      if (succeeded.length) {
        console.log("[events] Retry succeeded for some events, removing from queue", { succeeded })
        setPendingEventIds((prev) => prev.filter((id) => !succeeded.includes(id)))
      }
    }

    void retryPending()
  }, [isOnline, pendingEventIds, localEvents, sendEventToServer])

  // Reintentar borrar eventos deshechos cuando volvemos a estar online
  useEffect(() => {
    if (!isOnline) return
    if (!pendingDeleteEventIds.length) return

    const processDeletes = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) return

        const succeeded: string[] = []

        for (const id of pendingDeleteEventIds) {
          try {
            const res = await fetch(`/api/mesa/matches/${matchId}/events`, {
              method: "DELETE",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ eventId: id }),
            })

            // Si la API devuelve 200, o 400/404 (evento ya no existe o request invalida),
            // consideramos que ya no hace falta reintentar y sacamos el id de la cola.
            if (res.ok || res.status === 400 || res.status === 404) {
              succeeded.push(id)
            }
          } catch (error) {
            // Si hay error de red, mantenemos el id en la cola para reintentar luego.
          }
        }

        if (succeeded.length) {
          setPendingDeleteEventIds((prev) => prev.filter((id) => !succeeded.includes(id)))
        }
      } catch {
        // Si falla el procesamiento completo, dejamos la cola como está para reintentar luego.
      }
    }

    void processDeletes()
  }, [isOnline, pendingDeleteEventIds, supabase, matchId])

  // Hidratar historial y marcador desde Supabase si no hay historial local significativo
  useEffect(() => {
    // Si ya restauramos desde localStorage y hay eventos, no pisamos nada
    if (restoredFromStorage && localEvents.length > 0) return
    if (!matchId) return
    if (!homeTeam || !awayTeam) return

    const loadEventsFromDb = async () => {
      try {
        const { data: rows, error } = await supabase
          .from("match_events")
          .select(
            "id, match_id, team_id, player_id, type, points, period, game_time, occurred_at, shot_type, made, x, y, rebound_type, foul_type",
          )
          .eq("match_id", matchId)
          .order("occurred_at", { ascending: true })

        if (error || !rows || rows.length === 0) return

        const mapped: MatchEvent[] = rows.map((r: any) => ({
          id: r.id,
          matchId: r.match_id,
          teamId: r.team_id,
          playerId: r.player_id,
          type: r.type,
          points: r.points ?? undefined,
          period: r.period,
          gameTime: r.game_time,
          timestamp: new Date(r.occurred_at),
          shotType: r.shot_type ?? undefined,
          made: r.made ?? undefined,
          x: r.x ?? undefined,
          y: r.y ?? undefined,
          reboundType: r.rebound_type ?? undefined,
          foulType: r.foul_type ?? undefined,
        }))

        setLocalEvents(mapped)

        // Recalcular marcador desde los eventos de BD
        let restoredHomeScore = 0
        let restoredAwayScore = 0

        mapped.forEach((ev) => {
          const isHome = ev.teamId === homeTeam?.id

          if (ev.type === "points" && ev.points) {
            if (isHome) restoredHomeScore += ev.points
            else restoredAwayScore += ev.points
          }

          if (ev.type === "shot" && ev.made && ev.shotType) {
            if (isHome) restoredHomeScore += ev.shotType
            else restoredAwayScore += ev.shotType
          }

          if (ev.type === "free_throw" && ev.made) {
            if (isHome) restoredHomeScore += 1
            else restoredAwayScore += 1
          }
        })

        setHomeScore(restoredHomeScore)
        setAwayScore(restoredAwayScore)
      } catch {
        // Si falla, mantenemos la fuente local
      }
    }

    void loadEventsFromDb()
  }, [matchId, supabase, restoredFromStorage, localEvents.length, homeTeam, awayTeam])

  useEffect(() => {
    if (!match) return
    // Si ya restauramos desde localStorage, no pisamos el marcador
    if (restoredFromStorage) return
    setHomeScore(match.homeScore ?? 0)
    setAwayScore(match.awayScore ?? 0)
  }, [match?.homeScore, match?.awayScore, match?.id, restoredFromStorage])

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

  const adjustGameTime = (deltaSeconds: number) => {
    if (isRunning) return
    setGameTime((prev) => {
      const max = 99 * 60 + 59
      const next = Math.max(0, Math.min(max, prev + deltaSeconds))
      return next
    })
  }

  const adjustTimeDigit = (position: 0 | 1 | 2 | 3, delta: -1 | 1) => {
    if (isRunning || !showClockEditor) return

    setGameTime((prev) => {
      let mins = Math.floor(prev / 60)
      let secs = prev % 60

      const d0 = Math.floor(mins / 10)
      const d1 = mins % 10
      const d2 = Math.floor(secs / 10)
      const d3 = secs % 10

      let nd0 = d0
      let nd1 = d1
      let nd2 = d2
      let nd3 = d3

      const apply = (d: number, max: number) => {
        let next = d + delta
        if (next < 0) next = max
        if (next > max) next = 0
        return next
      }

      if (position === 0) nd0 = apply(d0, 9)
      if (position === 1) nd1 = apply(d1, 9)
      if (position === 2) nd2 = apply(d2, 5)
      if (position === 3) nd3 = apply(d3, 9)

      mins = nd0 * 10 + nd1
      secs = nd2 * 10 + nd3

      const maxTotal = 99 * 60 + 59
      const total = Math.max(0, Math.min(maxTotal, mins * 60 + secs))
      return total
    })
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

  // Contadores de tiempos muertos por equipo
  const teamTimeouts = useMemo(
    () => {
      if (!homeTeam || !awayTeam) {
        return {
          home: { firstHalf: 0, secondHalf: 0, overtime: 0 },
          away: { firstHalf: 0, secondHalf: 0, overtime: 0 },
        }
      }

      const base = {
        home: { firstHalf: 0, secondHalf: 0, overtime: 0 },
        away: { firstHalf: 0, secondHalf: 0, overtime: 0 },
      }

      const timeouts = localEvents.filter((e) => e.type === "timeout")

      timeouts.forEach((e) => {
        const teamSide: "home" | "away" = e.teamId === homeTeam.id ? "home" : "away"

        if (e.period <= 2) {
          // Primera mitad: se cuentan hasta 2 tiempos muertos
          base[teamSide].firstHalf += 1
        } else if (e.period <= 4) {
          // Segunda mitad: se cuentan hasta 3 tiempos muertos
          base[teamSide].secondHalf += 1
        } else if (e.period === period) {
          // En prórrogas solo contamos los tiempos del período actual
          base[teamSide].overtime += 1
        }
      })

      // Regla FIBA adicional: en los últimos 2 minutos del último cuarto,
      // si un equipo aún NO usó ningún tiempo muerto en la segunda mitad
      // (tenía disponibles los 3), pierde uno automáticamente y solo puede
      // pedir 2 en total en esa mitad.
      if (period === 4 && gameTime <= 120) {
        (['home', 'away'] as const).forEach((side) => {
          if (base[side].secondHalf === 0) {
            base[side].secondHalf = 1
          }
        })
      }

      return base
    },
    [homeTeam, awayTeam, localEvents, period, gameTime],
  )

  // Función para verificar si una entidad (jugador, técnico, asistente o banca) está descalificada
  const isEntityDisqualified = (entityId: string): boolean => {
    const isStaff = entityId.startsWith("tech-") || entityId.startsWith("assist-") || entityId.startsWith("bench-")

    // Jugadores: reglas estándar de 5 faltas y combinaciones especiales
    if (!isStaff) {
      const playerEvents = localEvents.filter((e) => e.playerId === entityId && e.type === "foul")

      const personalFouls = playerEvents.filter((e) => e.foulType === "personal").length
      const technicalFouls = playerEvents.filter((e) => e.foulType === "technical").length
      const unsportsmanlikeFouls = playerEvents.filter((e) => e.foulType === "unsportsmanlike").length
      const disqualifyingFouls = playerEvents.filter((e) => e.foulType === "disqualifying").length
      const fightFouls = playerEvents.filter((e) => e.foulType === "fight").length

      return (
        personalFouls >= 5 ||
        technicalFouls >= 2 ||
        unsportsmanlikeFouls >= 2 ||
        (technicalFouls >= 1 && unsportsmanlikeFouls >= 1) ||
        disqualifyingFouls >= 1 ||
        fightFouls >= 1
      )
    }

    // Cuerpo técnico y banca
    const [kind, ...rest] = entityId.split("-")
    const teamId = rest.join("-") // UUID puede tener guiones

    const coachId = `tech-${teamId}`
    const benchId = `bench-${teamId}`

    const coachEvents = localEvents.filter((e) => e.type === "foul" && e.playerId === coachId)
    const benchEvents = localEvents.filter(
      (e) => e.type === "foul" && e.playerId === benchId && e.foulType === "technical",
    )

    const coachTechs = coachEvents.filter((e) => e.foulType === "technical").length
    const coachDisq = coachEvents.filter((e) => e.foulType === "disqualifying").length
    const coachFight = coachEvents.filter((e) => e.foulType === "fight").length
    const benchTechs = benchEvents.length

    // Técnicos y asistentes: 2 técnicas, o 1 descalificante, o 1 reyerta
    if (kind === "assist") {
      const selfEvents = localEvents.filter((e) => e.type === "foul" && e.playerId === entityId)
      const selfTechs = selfEvents.filter((e) => e.foulType === "technical").length
      const selfDisq = selfEvents.filter((e) => e.foulType === "disqualifying").length
      const selfFight = selfEvents.filter((e) => e.foulType === "fight").length
      return selfTechs >= 2 || selfDisq >= 1 || selfFight >= 1
    }

    // Head coach: 2 técnicas propias, o descalificante/reyerta, o
    // 3 técnicas a la banca, o 2 a la banca + 1 al técnico (regla combinada)
    if (kind === "tech") {
      const baseEject = coachTechs >= 2 || coachDisq >= 1 || coachFight >= 1
      const benchCombo = benchTechs >= 3 || (benchTechs >= 2 && coachTechs >= 1)
      return baseEject || benchCombo
    }

    // Banca: se considera "agotada" al llegar a 3 técnicas o a la combinación con el DT
    if (kind === "bench") {
      const benchCombo = benchTechs >= 3 || (benchTechs >= 2 && coachTechs >= 1)
      return benchCombo
    }

    return false
  }

  // Asegurar que los jugadores descalificados nunca queden en onCourtPlayers
  useEffect(() => {
    setOnCourtPlayers((prev) => ({
      home: prev.home.filter((id) => !isEntityDisqualified(id)),
      away: prev.away.filter((id) => !isEntityDisqualified(id)),
    }))
  }, [localEvents])

  // Actualizar lista de jugadores descalificados
  const disqualifiedPlayers = useMemo(() => {
    const disqualified = new Set<string>()
    ;[...homePlayers, ...awayPlayers].forEach(player => {
      if (isEntityDisqualified(player.id)) {
        disqualified.add(player.id)
      }
    })
    return disqualified
  }, [localEvents, homePlayers, awayPlayers])

  // Estadísticas por jugador derivadas de los eventos locales
  const getPlayerStats = useCallback(
    (playerId: string) => {
      const events = localEvents.filter((e) => e.playerId === playerId)

      let points = 0
      let fouls = 0
      let rebounds = 0
      let blocks = 0
      let turnovers = 0
      let assists = 0

      for (const e of events) {
        if (e.type === "points" && e.points) points += e.points
        else if (e.type === "shot" && e.made && e.shotType) points += e.shotType
        else if (e.type === "free_throw" && e.made) points += 1

        if (e.type === "foul") fouls += 1
        if (e.type === "rebound") rebounds += 1
        if (e.type === "block") blocks += 1
        if (e.type === "turnover") turnovers += 1
        if (e.type === "assist") assists += 1
      }

      return { points, fouls, rebounds, blocks, turnovers, assists }
    },
    [localEvents],
  )

  // Jugadores visibles en paneles (solo los en cancha si hay definición)
  const visibleHomePlayers = useMemo(
    () =>
      onCourtPlayers.home.length
        ? homePlayers.filter((p) => onCourtPlayers.home.includes(p.id))
        : homePlayers,
    [homePlayers, onCourtPlayers.home],
  )

  const visibleAwayPlayers = useMemo(
    () =>
      onCourtPlayers.away.length
        ? awayPlayers.filter((p) => onCourtPlayers.away.includes(p.id))
        : awayPlayers,
    [awayPlayers, onCourtPlayers.away],
  )

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

  // Solicitar tiempo muerto para un equipo
  const requestTimeout = useCallback(
    (teamSide: "home" | "away") => {
      if (match?.status !== "en_juego") return false
      if (!homeTeam || !awayTeam) return false
      if (
        pendingReboundTeamId ||
        pendingAssistTeamId ||
        pendingFreeThrow ||
        pendingPersonalFoul ||
        pendingBlock ||
        pendingTurnover
      ) {
        return false
      }

      const teamId = teamSide === "home" ? homeTeam.id : awayTeam.id
      const timeouts = teamTimeouts[teamSide]
      const totalUsed = timeouts.firstHalf + timeouts.secondHalf

      // Reglas: 2 tiempos en la primera mitad (P1-2), 3 en la segunda mitad (P3-4), total 5.
      // En prórrogas: 1 tiempo por equipo y por prórroga, independiente de los anteriores.
      if (period <= 2) {
        if (timeouts.firstHalf >= 2) return false
        if (totalUsed >= 5) return false
      } else if (period <= 4) {
        if (timeouts.secondHalf >= 3) return false
        if (totalUsed >= 5) return false
      } else {
        if (timeouts.overtime >= 1) return false
      }

      const event: MatchEvent = {
        id: `ev-${Date.now()}`,
        matchId,
        playerId: teamId,
        teamId,
        type: "timeout",
        period,
        timestamp: new Date(),
        gameTime: formatTime(gameTime),
      }

      // Detenemos el reloj al registrar un tiempo muerto
      setIsRunning(false)
      setLocalEvents((prev) => [...prev, event])
      addMatchEvent(event)
      setSyncStatus("pending")

      if (!isOnline) {
        console.log("[events] Timeout created offline, marking as pending", { id: event.id })
        setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
      } else {
        void (async () => {
          const ok = await sendEventToServer(event)
          if (!ok) {
            console.log("[events] Timeout send failed, marking as pending", { id: event.id })
            setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
          }
        })()
      }
      return true
    },
    [
      match?.status,
      homeTeam,
      awayTeam,
      teamTimeouts,
      period,
      gameTime,
      matchId,
      pendingReboundTeamId,
      pendingAssistTeamId,
      pendingFreeThrow,
      pendingPersonalFoul,
      pendingBlock,
      pendingTurnover,
      addMatchEvent,
    ],
  )

  // Cuenta regresiva visual de tiempo muerto (60s)
  useEffect(() => {
    if (timeoutCountdown === null) return
    if (timeoutCountdown <= 0) {
      setTimeoutCountdown(null)
      setTimeoutTeamSide(null)
      setTimeoutMinimized(false)
      return
    }

    const id = window.setInterval(() => {
      setTimeoutCountdown((prev) => (prev !== null ? Math.max(prev - 1, 0) : null))
    }, 1000)

    return () => window.clearInterval(id)
  }, [timeoutCountdown])

  // Add foul
  const addFoul = useCallback(
    (playerId: string, teamSide: "home" | "away", foulType: MatchEvent["foulType"] = "personal") => {
      if (match?.status !== "en_juego" || !homeTeam || !awayTeam) return

      // Verificar si la entidad (jugador / staff / banca) ya está descalificada
      if (isEntityDisqualified(playerId)) {
        return
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

      if (!isOnline) {
        console.log("[events] Foul created offline, marking as pending", { id: event.id, foulType })
        setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
      } else {
        void (async () => {
          const ok = await sendEventToServer(event)
          if (!ok) {
            console.log("[events] Foul send failed, marking as pending", { id: event.id, foulType })
            setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
          }
        })()
      }

      // Verificar si el equipo entra en infracción con esta falta
      const currentTeamFouls = teamFoulsInPeriod[teamSide] + 1
      if (currentTeamFouls === 4) {
        // El equipo acaba de entrar en infracción
        console.log(`Equipo ${teamSide} entra en infracción (4 faltas)`)
      }

      // Si esta falta provoca que el jugador quede descalificado, sacarlo de la cancha y abrir sustitución.
      // Solo aplicamos esta lógica para jugadores (no staff/banca), que son los que aparecen en onCourtPlayers.
      const nextEventsForPlayer = [...localEvents, event].filter((e) => e.playerId === playerId && e.type === "foul")
      const personalFouls = nextEventsForPlayer.filter((e) => e.foulType === "personal").length
      const technicalFouls = nextEventsForPlayer.filter((e) => e.foulType === "technical").length
      const unsportsmanlikeFouls = nextEventsForPlayer.filter((e) => e.foulType === "unsportsmanlike").length
      const disqualifyingFouls = nextEventsForPlayer.filter((e) => e.foulType === "disqualifying").length
      const fightFouls = nextEventsForPlayer.filter((e) => e.foulType === "fight").length

      const nowDisqualified =
        personalFouls >= 5 ||
        technicalFouls >= 2 ||
        unsportsmanlikeFouls >= 2 ||
        (technicalFouls >= 1 && unsportsmanlikeFouls >= 1) ||
        disqualifyingFouls >= 1 ||
        fightFouls >= 1

      if (nowDisqualified) {
        // Sacar al jugador de la cancha si estaba en onCourtPlayers
        const currentOnCourt = onCourtPlayers[teamSide].filter((id) => id !== playerId)
        if (currentOnCourt.length !== onCourtPlayers[teamSide].length) {
          setOnCourtPlayers((prev) => ({ ...prev, [teamSide]: currentOnCourt }))
        }

        // Abrir diálogo de sustituciones para este equipo, proponiendo como selección actual
        // los jugadores que permanecen en cancha (sin el expulsado).
        setSubsDialogTeamSide(teamSide)
        setSubsSelection(currentOnCourt)
        setShowSubsDialog(true)
      }
    },
    [
      matchId,
      homeTeam,
      awayTeam,
      period,
      gameTime,
      addMatchEvent,
      isEntityDisqualified,
      teamFoulsInPeriod,
      isOnline,
      sendEventToServer,
      localEvents,
      onCourtPlayers,
    ],
  )

  // Undo last action
  const undoLastAction = () => {
    if (localEvents.length === 0) return

    const lastEvent = localEvents[localEvents.length - 1]
    const teamSideForEvent: "home" | "away" | null =
      lastEvent.teamId === homeTeam?.id ? "home" : lastEvent.teamId === awayTeam?.id ? "away" : null

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

    // Deshacer sustituciones: mover jugadores de vuelta según el último evento
    if (teamSideForEvent && lastEvent.type === "substitution_in" && lastEvent.playerId) {
      setOnCourtPlayers((prev) => ({
        ...prev,
        [teamSideForEvent]: prev[teamSideForEvent].filter((id) => id !== lastEvent.playerId),
      }))
    }

    if (teamSideForEvent && lastEvent.type === "substitution_out" && lastEvent.playerId) {
      setOnCourtPlayers((prev) => {
        const current = prev[teamSideForEvent]
        if (current.includes(lastEvent.playerId!)) return prev
        return {
          ...prev,
          [teamSideForEvent]: [...current, lastEvent.playerId!],
        }
      })
    }

    // Deshacer una falta que podía haber descalificado al jugador: si al quitarla ya no está descalificado,
    // permitir que vuelva a estar en cancha (si no fue sustituido después).
    if (teamSideForEvent && lastEvent.type === "foul" && lastEvent.playerId) {
      const remainingFouls = localEvents
        .slice(0, -1)
        .filter((e) => e.playerId === lastEvent.playerId && e.type === "foul")

      const personalFouls = remainingFouls.filter((e) => e.foulType === "personal").length
      const technicalFouls = remainingFouls.filter((e) => e.foulType === "technical").length
      const unsportsmanlikeFouls = remainingFouls.filter((e) => e.foulType === "unsportsmanlike").length
      const disqualifyingFouls = remainingFouls.filter((e) => e.foulType === "disqualifying").length
      const fightFouls = remainingFouls.filter((e) => e.foulType === "fight").length

      const stillDisqualified =
        personalFouls >= 5 ||
        technicalFouls >= 2 ||
        unsportsmanlikeFouls >= 2 ||
        (technicalFouls >= 1 && unsportsmanlikeFouls >= 1) ||
        disqualifyingFouls >= 1 ||
        fightFouls >= 1

      if (!stillDisqualified) {
        setOnCourtPlayers((prev) => {
          const current = prev[teamSideForEvent]
          if (current.includes(lastEvent.playerId!)) return prev
          // Lo agregamos de vuelta al final; si no hay lugar por una sustitución posterior, el usuario puede ajustar.
          return {
            ...prev,
            [teamSideForEvent]: [...current, lastEvent.playerId!],
          }
        })
      }
    }

    setPendingAssistTeamId(null)
    setPendingAssistScorerId(null)
    setPendingFreeThrow(null)

    setLocalEvents((prev) => prev.slice(0, -1))
    removeLastMatchEvent(matchId)

    if (!isOnline) {
      // Guardar borrado pendiente para cuando vuelva la conexión
      setPendingDeleteEventIds((prev) => (prev.includes(lastEvent.id) ? prev : [...prev, lastEvent.id]))
    } else {
      void (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData.session?.access_token
          if (!token) {
            setPendingDeleteEventIds((prev) => (prev.includes(lastEvent.id) ? prev : [...prev, lastEvent.id]))
            return
          }

          const res = await fetch(`/api/mesa/matches/${matchId}/events`, {
            method: "DELETE",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ eventId: lastEvent.id }),
          })

          if (!res.ok) {
            console.error("[events] Failed to delete event on undo (status)", { id: lastEvent.id, status: res.status })
            setPendingDeleteEventIds((prev) => (prev.includes(lastEvent.id) ? prev : [...prev, lastEvent.id]))
          }
        } catch (error) {
          console.error("[events] Failed to delete event on undo", { id: lastEvent.id, error })
          setPendingDeleteEventIds((prev) => (prev.includes(lastEvent.id) ? prev : [...prev, lastEvent.id]))
        }
      })()
    }
  }

  // Cancelar la visualización del tiempo muerto (skipping del minuto en pantalla)
  // El tiempo muerto ya quedó registrado como evento y se cuenta para el equipo.
  const cancelActiveTimeout = () => {
    setTimeoutCountdown(null)
    setTimeoutTeamSide(null)
    setTimeoutMinimized(false)
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
    if (pendingPersonalFoul) return
    if (pendingBlock) return
    if (pendingTurnover) return

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

    // Si no hay conexión en este momento, marcamos el evento como pendiente
    // para que el efecto de reintento lo envíe cuando vuelva internet.
    if (!isOnline) {
      console.log("[events] Shot created offline, marking as pending", { id: event.id })
      setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
      return
    }

    // Si hay conexión, intentamos enviarlo ahora mismo; si falla, también lo dejamos pendiente.
    void (async () => {
      const ok = await sendEventToServer(event)
      if (!ok) {
        console.log("[events] Shot send failed, marking as pending", { id: event.id })
        setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
      }
    })()
  }

  const startFreeThrows = (total: 1 | 2 | 3) => {
    if (match.status !== "en_juego") return
    if (!selectedPlayerId) return
    if (pendingReboundTeamId || pendingAssistTeamId || pendingFreeThrow || pendingPersonalFoul || pendingBlock || pendingTurnover)
      return

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

    if (!isOnline) {
      console.log("[events] Free throw created offline, marking as pending", { id: event.id })
      setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
    } else {
      void (async () => {
        const ok = await sendEventToServer(event)
        if (!ok) {
          console.log("[events] Free throw send failed, marking as pending", { id: event.id })
          setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
        }
      })()
    }

    if (current >= total) {
      setPendingFreeThrow(null)
    } else {
      setPendingFreeThrow({ playerId, teamId, teamSide, total, current: current + 1 })
    }
  }

  const registerAssist = (playerId: string) => {
    if (match.status !== "en_juego") return
    if (pendingPersonalFoul) return
    if (pendingBlock) return
    if (pendingTurnover) return
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

    if (!isOnline) {
      console.log("[events] Assist created offline, marking as pending", { id: event.id })
      setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
      return
    }

    void (async () => {
      const ok = await sendEventToServer(event)
      if (!ok) {
        console.log("[events] Assist send failed, marking as pending", { id: event.id })
        setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
      }
    })()
  }

  const registerRebound = (playerId: string) => {
    if (match.status !== "en_juego") return
    if (pendingPersonalFoul) return
    if (pendingBlock) return
    if (pendingTurnover) return
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

    if (!isOnline) {
      console.log("[events] Rebound created offline, marking as pending", { id: event.id })
      setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
      return
    }

    void (async () => {
      const ok = await sendEventToServer(event)
      if (!ok) {
        console.log("[events] Rebound send failed, marking as pending", { id: event.id })
        setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
      }
    })()
  }

  const finalizeTurnover = (stealerId: string | null) => {
    if (!pendingTurnover) return
    const loserTeam = getPlayerTeam(pendingTurnover.loserId)
    if (!loserTeam) {
      setPendingTurnover(null)
      return
    }

    const baseEvent: MatchEvent = {
      id: `ev-${Date.now()}`,
      matchId,
      playerId: pendingTurnover.loserId,
      teamId: loserTeam.teamId,
      type: "turnover",
      period,
      timestamp: new Date(),
      gameTime: formatTime(gameTime),
    }

    const events: MatchEvent[] = [baseEvent]

    if (stealerId) {
      const stealerTeam = getPlayerTeam(stealerId)
      if (stealerTeam) {
        events.push({
          id: `ev-${Date.now()}-st`,
          matchId,
          playerId: stealerId,
          teamId: stealerTeam.teamId,
          type: "steal",
          period,
          timestamp: new Date(),
          gameTime: formatTime(gameTime),
        })
      }
    }

    setLocalEvents((prev) => [...prev, ...events])
    events.forEach((ev) => addMatchEvent(ev))
    setSyncStatus("pending")

    if (!isOnline) {
      console.log("[events] Turnover/steal created offline, marking as pending", {
        ids: events.map((e) => e.id),
      })
      setPendingEventIds((prev) => {
        const next = [...prev]
        events.forEach((ev) => {
          if (!next.includes(ev.id)) next.push(ev.id)
        })
        return next
      })
    } else {
      void (async () => {
        const failed: string[] = []
        for (const ev of events) {
          const ok = await sendEventToServer(ev)
          if (!ok) failed.push(ev.id)
        }
        if (failed.length) {
          console.log("[events] Some turnover/steal events failed to send, marking as pending", { failed })
          setPendingEventIds((prev) => {
            const next = [...prev]
            failed.forEach((id) => {
              if (!next.includes(id)) next.push(id)
            })
            return next
          })
        }
      })()
    }
    setPendingTurnover(null)
  }

  const PlayerButton = ({ player, teamSide }: { player: Player; teamSide: "home" | "away" }) => {
    const { points: playerPoints, fouls: playerFouls } = getPlayerStats(player.id)

    const isSelected = selectedPlayerId === player.id
    const isDisqualified = disqualifiedPlayers.has(player.id)

    const baseBgColor = teamSide === "home" ? `${homeColor}14` : `${awayColor}14`

    return (
      <div
        className={`rounded-lg border p-2 ${isSelected ? "border-primary" : ""} ${isDisqualified ? "border-red-500 bg-red-50" : ""}`}
        style={!isDisqualified ? { backgroundColor: baseBgColor } : undefined}
      >
        <button
          type="button"
          className="w-full"
          disabled={isDisqualified}
          onClick={() => {
            if (pendingFreeThrow) {
              return
            }
            // Si hay una falta personal pendiente, este jugador es quien LA RECIBE.
            // La falta se contabiliza sobre el jugador que la cometió (botón que inició la acción).
            if (pendingPersonalFoul) {
              if (pendingPersonalFoul.targetTeamSide === teamSide) {
                addFoul(pendingPersonalFoul.committerId, pendingPersonalFoul.committerTeamSide, "personal")
                setPendingPersonalFoul(null)
              }
              return
            }
            // Pérdida/Recuperación: este jugador es quien RECUPERA la pelota
            if (pendingTurnover) {
              if (pendingTurnover.targetTeamSide === teamSide) {
                finalizeTurnover(player.id)
              }
              return
            }
            // Si hay una tapa pendiente, este jugador es quien RECIBE la tapa.
            if (pendingBlock) {
              if (pendingBlock.targetTeamSide === teamSide) {
                const blockerTeam = getPlayerTeam(pendingBlock.blockerId)
                const targetTeam = getPlayerTeam(player.id)
                if (blockerTeam) {
                  const event: MatchEvent = {
                    id: `ev-${Date.now()}`,
                    matchId,
                    playerId: pendingBlock.blockerId,
                    teamId: blockerTeam.teamId,
                    type: "block",
                    period,
                    timestamp: new Date(),
                    gameTime: formatTime(gameTime),
                  }
                  setLocalEvents((prev) => [...prev, event])
                  addMatchEvent(event)
                  setSyncStatus("pending")

                  if (!isOnline) {
                    console.log("[events] Block created offline, marking as pending", { id: event.id })
                    setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
                  } else {
                    void (async () => {
                      const ok = await sendEventToServer(event)
                      if (!ok) {
                        console.log("[events] Block send failed, marking as pending", { id: event.id })
                        setPendingEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]))
                      }
                    })()
                  }
                }
                if (targetTeam) {
                  // Después de la tapa, permitir registrar rebote para cualquiera de los equipos
                  setPendingReboundTeamId(targetTeam.teamId)
                }
                setPendingBlock(null)
              }
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
                <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {playerPoints} pts | {playerFouls} faltas
                </p>
              </div>
            </div>
          </div>
        </button>
        <div className="mt-1.5 flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 text-xs font-medium px-2 border-muted-foreground/20 bg-background hover:bg-muted"
            onClick={() => {
              if (
                pendingReboundTeamId ||
                pendingAssistTeamId ||
                pendingFreeThrow ||
                pendingPersonalFoul ||
                pendingBlock ||
                pendingTurnover
              )
                return
              // Iniciar selección de jugador rival que RECIBE la falta.
              const targetTeamSide: "home" | "away" = teamSide === "home" ? "away" : "home"
              setPendingPersonalFoul({
                committerId: player.id,
                committerTeamSide: teamSide,
                targetTeamSide,
              })
            }}
            disabled={
              !!pendingReboundTeamId ||
              !!pendingAssistTeamId ||
              !!pendingFreeThrow ||
              isDisqualified ||
              !!pendingPersonalFoul ||
              !!pendingBlock ||
              !!pendingTurnover
            }
          >
            Falta
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 text-[11px] font-medium px-2"
            onClick={() => {
              if (pendingReboundTeamId || pendingAssistTeamId || pendingFreeThrow || isDisqualified) return
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
                teamSide,
              })
              setFreeThrowAttempts({ 1: null, 2: null, 3: null })
              setShowFreeThrowDialog(true)
            }}
            disabled={!!pendingReboundTeamId || !!pendingAssistTeamId || !!pendingFreeThrow || isDisqualified}
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
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={() => router.push("/mesa")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="hidden sm:flex flex-col items-start gap-0.5">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
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
                <span className="leading-none">
                  {syncStatus === "synced"
                    ? "Sincronizado"
                    : syncStatus === "pending"
                      ? "Pendiente"
                      : syncStatus === "syncing"
                        ? "Sincronizando"
                        : "Error"}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-1">
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                <span>{isOnline ? "Online" : "Offline"}</span>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
              {/* Local */}
              <div
                className="rounded-md border px-2 py-1.5"
                style={{ borderLeftColor: homeColor, borderLeftWidth: 6 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground">LOCAL</div>
                    <div
                      className="truncate text-sm font-semibold cursor-pointer hover:underline"
                      onClick={() => {
                        setSubsDialogTeamSide("home")
                        setSubsSelection(
                          onCourtPlayers.home.length ? onCourtPlayers.home : homePlayers.map((p) => p.id),
                        )
                        setShowSubsDialog(true)
                      }}
                    >
                      {homeTeam.name}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <span>Faltas:</span>
                      <div className={`px-1.5 py-0.5 rounded font-medium ${teamFoulWarning.home ? "bg-red-100 text-red-700" : "bg-muted"}`}>
                        {teamFoulsInPeriod.home}
                      </div>
                    </div>
                    {period <= 4 ? (
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <span>TM 1T:</span>
                        <div className="flex gap-0.5">
                          {[0, 1].map((i) => {
                            const used = Math.min(teamTimeouts.home.firstHalf, 2)
                            const active = i < used
                            return (
                              <span
                                key={i}
                                className={`h-4 w-4 rounded border bg-muted flex items-center justify-center text-[10px] leading-none cursor-pointer ${active ? "font-bold" : ""}`}
                                onClick={() => setTimeoutDialogTeamSide("home")}
                              >
                                {active ? "X" : ""}
                              </span>
                            )
                          })}
                        </div>
                        <span>2T:</span>
                        <div className="flex gap-0.5">
                          {[0, 1, 2].map((i) => {
                            const used = Math.min(teamTimeouts.home.secondHalf, 3)
                            const active = i < used
                            return (
                              <span
                                key={i}
                                className={`h-4 w-4 rounded border bg-muted flex items-center justify-center text-[10px] leading-none cursor-pointer ${active ? "font-bold" : ""}`}
                                onClick={() => setTimeoutDialogTeamSide("home")}
                              >
                                {active ? "X" : ""}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <span>TM:</span>
                        <div className="flex gap-0.5">
                          {[0].map((i) => {
                            const used = Math.min(teamTimeouts.home.overtime, 1)
                            const active = i < used
                            return (
                              <span
                                key={i}
                                className={`h-4 w-4 rounded border bg-muted flex items-center justify-center text-[10px] leading-none cursor-pointer ${active ? "font-bold" : ""}`}
                                onClick={() => setTimeoutDialogTeamSide("home")}
                              >
                                {active ? "X" : ""}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
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
                    <div className="h-9 w-[92px] text-center font-mono text-xl font-bold mx-auto flex items-center justify-center">
                      {formatTime(gameTime)}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      if (!isRunning && showClockEditor) {
                        setShowClockEditorWarning(true)
                        return
                      }
                      setIsRunning((prev) => !prev)
                    }}
                  >
                    {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  {lastScoreFlash && (
                    <div
                      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-sm animate-in fade-in zoom-in duration-150"
                      style={{
                        backgroundColor: lastScoreFlash.teamSide === "home" ? homeColor : awayColor,
                      }}
                    >
                      +{lastScoreFlash.points}
                    </div>
                  )}
                  {timeoutCountdown !== null && timeoutTeamSide && !timeoutMinimized && (
                    <div className="fixed inset-0 z-40 flex items-center justify-center">
                      <div className="relative w-[min(320px,90vw)] rounded-xl border bg-background px-4 py-3 shadow-xl">
                        <div className="absolute right-8 top-2 flex items-center gap-1">
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-full border bg-muted text-muted-foreground text-xs"
                            onClick={() => setTimeoutMinimized(true)}
                          >
                            <ChevronRight className="h-3 w-3 -rotate-90" />
                          </button>
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-full border bg-muted text-destructive text-xs"
                            onClick={cancelActiveTimeout}
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex flex-col items-center justify-center gap-2 pt-4 pb-1">
                          <div className="text-xs font-medium text-muted-foreground">
                            Tiempo muerto
                          </div>
                          <div className="text-sm font-semibold">
                            {timeoutTeamSide === "home" ? homeTeam.name : awayTeam.name}
                          </div>
                          <div className="font-mono text-3xl font-semibold tracking-tight">
                            {formatTime(timeoutCountdown)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {timeoutCountdown !== null && timeoutTeamSide && timeoutMinimized && (
                    <button
                      type="button"
                      className="fixed bottom-4 right-4 z-40 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground shadow-lg"
                      onClick={() => setTimeoutMinimized(false)}
                    >
                      <span className="leading-tight">TM</span>
                      <span className="font-mono text-sm font-semibold">{formatTime(timeoutCountdown)}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Visitante */}
              <div
                className="rounded-md border px-2 py-1.5"
                style={{ borderRightColor: awayColor, borderRightWidth: 6 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-2xl font-bold tabular-nums">{awayScore}</div>
                  <div className="min-w-0 text-right">
                    <div className="truncate text-xs text-muted-foreground">VISITANTE</div>
                    <div
                      className="truncate text-sm font-semibold cursor-pointer hover:underline"
                      onClick={() => {
                        setSubsDialogTeamSide("away")
                        setSubsSelection(
                          onCourtPlayers.away.length ? onCourtPlayers.away : awayPlayers.map((p) => p.id),
                        )
                        setShowSubsDialog(true)
                      }}
                    >
                      {awayTeam.name}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground mt-1">
                      <div className={`px-1.5 py-0.5 rounded font-medium ${teamFoulWarning.away ? "bg-red-100 text-red-700" : "bg-muted"}`}>
                        {teamFoulsInPeriod.away}
                      </div>
                      <span>Faltas:</span>
                    </div>
                    {period <= 4 ? (
                      <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <span>TM 1T:</span>
                        <div className="flex gap-0.5">
                          {[0, 1].map((i) => {
                            const used = Math.min(teamTimeouts.away.firstHalf, 2)
                            const active = i < used
                            return (
                              <span
                                key={i}
                                className={`h-4 w-4 rounded border bg-muted flex items-center justify-center text-[10px] leading-none cursor-pointer ${active ? "font-bold" : ""}`}
                                onClick={() => setTimeoutDialogTeamSide("away")}
                              >
                                {active ? "X" : ""}
                              </span>
                            )
                          })}
                        </div>
                        <span>2T:</span>
                        <div className="flex gap-0.5">
                          {[0, 1, 2].map((i) => {
                            const used = Math.min(teamTimeouts.away.secondHalf, 3)
                            const active = i < used
                            return (
                              <span
                                key={i}
                                className={`h-4 w-4 rounded border bg-muted flex items-center justify-center text-[10px] leading-none cursor-pointer ${active ? "font-bold" : ""}`}
                                onClick={() => setTimeoutDialogTeamSide("away")}
                              >
                                {active ? "X" : ""}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <span>TM:</span>
                        <div className="flex gap-0.5">
                          {[0].map((i) => {
                            const used = Math.min(teamTimeouts.away.overtime, 1)
                            const active = i < used
                            return (
                              <span
                                key={i}
                                className={`h-4 w-4 rounded border bg-muted flex items-center justify-center text-[10px] leading-none cursor-pointer ${active ? "font-bold" : ""}`}
                                onClick={() => setTimeoutDialogTeamSide("away")}
                              >
                                {active ? "X" : ""}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
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
          <TabsContent value="cancha" className="m-0 h-full pb-16 md:pb-4">
            <div className="h-full grid grid-cols-1 gap-2 p-3 md:grid-cols-12">
              <div className="hidden md:block md:col-span-3 overflow-hidden">
                <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
                  <div
                    className="px-3 py-2 text-sm font-semibold cursor-pointer"
                    style={{ borderLeftColor: homeColor, borderLeftWidth: 6 }}
                    onClick={() => {
                      setSubsDialogTeamSide("home")
                      setSubsSelection(
                        onCourtPlayers.home.length ? onCourtPlayers.home : homePlayers.map((p) => p.id),
                      )
                      setShowSubsDialog(true)
                    }}
                  >
                    {homeTeam.name}
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-2">
                    {visibleHomePlayers.map((player) => (
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
                        {pendingTurnover
                          ? "Pérdida pendiente: tocá un jugador rival que recupera o 'Sin recuperación'"
                          : pendingBlock
                            ? "Tapa pendiente: tocá un jugador del equipo rival que recibe la tapa"
                            : pendingPersonalFoul
                              ? "Falta personal pendiente: tocá un jugador del equipo rival que la recibe"
                              : pendingAssistTeamId && pendingAssistScorerId
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
                      {!pendingFreeThrow && pendingTurnover && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            finalizeTurnover(null)
                          }}
                        >
                          Sin recuperación
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

                  <div className="p-3 pb-2">
                    <ShotMap
                      disabled={
                        !selectedPlayerId ||
                        match.status !== "en_juego" ||
                        !!pendingReboundTeamId ||
                        !!pendingFreeThrow ||
                        !!pendingPersonalFoul ||
                        !!pendingBlock ||
                        !!pendingTurnover
                      }
                      onShot={registerShot}
                    />
                  </div>

                  {/* Botón de Otras Faltas debajo de la cancha */}
                  <div className="px-3 py-2 border-t">
                    <Button
                      variant="outline"
                      className="w-full mb-2"
                      onClick={() => {
                        if (!selectedPlayerId) return
                        if (
                          pendingReboundTeamId ||
                          pendingAssistTeamId ||
                          pendingFreeThrow ||
                          pendingPersonalFoul ||
                          pendingBlock ||
                          pendingTurnover
                        )
                          return

                        const blockerTeam = getPlayerTeam(selectedPlayerId)
                        if (!blockerTeam) return
                        const targetTeamSide: "home" | "away" =
                          blockerTeam.teamSide === "home" ? "away" : "home"
                        setPendingBlock({
                          blockerId: selectedPlayerId,
                          blockerTeamSide: blockerTeam.teamSide,
                          targetTeamSide,
                        })
                      }}
                      disabled={
                        !selectedPlayerId ||
                        match.status !== "en_juego" ||
                        !!pendingReboundTeamId ||
                        !!pendingAssistTeamId ||
                        !!pendingFreeThrow ||
                        !!pendingPersonalFoul ||
                        !!pendingBlock ||
                        !!pendingTurnover
                      }
                    >
                      Tapa
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        if (!selectedPlayerId) return
                        if (
                          pendingReboundTeamId ||
                          pendingAssistTeamId ||
                          pendingFreeThrow ||
                          pendingPersonalFoul ||
                          pendingBlock ||
                          pendingTurnover
                        )
                          return

                        const turnoverTeam = getPlayerTeam(selectedPlayerId)
                        if (!turnoverTeam) return
                        const targetTeamSide: "home" | "away" =
                          turnoverTeam.teamSide === "home" ? "away" : "home"
                        setPendingTurnover({
                          loserId: selectedPlayerId,
                          loserTeamSide: turnoverTeam.teamSide,
                          targetTeamSide,
                        })
                      }}
                      disabled={
                        !selectedPlayerId ||
                        match.status !== "en_juego" ||
                        !!pendingReboundTeamId ||
                        !!pendingAssistTeamId ||
                        !!pendingFreeThrow ||
                        !!pendingPersonalFoul ||
                        !!pendingBlock ||
                        !!pendingTurnover
                      }
                    >
                      Pérdida
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowOtherFoulDialog(true)}
                      disabled={
                        match.status !== "en_juego" ||
                        !!pendingReboundTeamId ||
                        !!pendingAssistTeamId ||
                        !!pendingFreeThrow ||
                        !!pendingPersonalFoul ||
                        !!pendingBlock ||
                        !!pendingTurnover
                      }
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
                      style={{ borderLeftColor: homeColor, borderLeftWidth: 6 }}
                    >
                      {homeTeam.name}
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedTeam === "away" ? "secondary" : "outline"}
                      className="flex-1 justify-start"
                      onClick={() => setSelectedTeam("away")}
                      style={{ borderRightColor: awayColor, borderRightWidth: 6 }}
                    >
                      {awayTeam.name}
                    </Button>
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-2">
                    {(selectedTeam === "home" ? visibleHomePlayers : visibleAwayPlayers).map((player) => (
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
                  <div
                    className="px-3 py-2 text-sm font-semibold text-right cursor-pointer"
                    style={{ borderRightColor: awayColor, borderRightWidth: 6 }}
                    onClick={() => {
                      setSubsDialogTeamSide("away")
                      setSubsSelection(
                        onCourtPlayers.away.length ? onCourtPlayers.away : awayPlayers.map((p) => p.id),
                      )
                      setShowSubsDialog(true)
                    }}
                  >
                    {awayTeam.name}
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-2">
                    {visibleAwayPlayers.map((player) => (
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
                        // Nombre / descripción de la persona involucrada
                        let personName = ""

                        // Manejo especial para sustituciones: agrupar sale / entra
                        if (e.type === "substitution_out") {
                          // No mostramos directamente el evento de salida; se mostrará junto al de entrada
                          return null
                        }

                        let title: string

                        if (e.type === "substitution_in") {
                          // Buscar el evento de salida asociado (misma jugada)
                          const pairedOut = localEvents.find(
                            (ev) =>
                              ev.type === "substitution_out" &&
                              ev.teamId === e.teamId &&
                              ev.gameTime === e.gameTime &&
                              Math.abs(new Date(ev.timestamp).getTime() - new Date(e.timestamp).getTime()) < 2000,
                          )

                          const inPlayer = player
                          const outPlayer = pairedOut
                            ? [...homePlayers, ...awayPlayers].find((p) => p.id === pairedOut.playerId)
                            : undefined

                          const inName = inPlayer
                            ? `${inPlayer.lastName.toUpperCase()}, ${inPlayer.firstName}`
                            : "Jugador entra"
                          const outName = outPlayer
                            ? `${outPlayer.lastName.toUpperCase()}, ${outPlayer.firstName}`
                            : "Jugador sale"

                          title = `Cambio: sale ${outName} / entra ${inName}`
                          personName = "" // Ya incluimos nombres en el título
                        } else {
                          if (e.foulType === "technical" && e.playerId.startsWith("tech-")) {
                            personName = "Técnico"
                          } else if (e.foulType === "technical" && e.playerId.startsWith("assist-")) {
                            personName = "Asistente"
                          } else if (player) {
                            personName = `${player.lastName.toUpperCase()}, ${player.firstName}`
                          }

                          title =
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
                        }

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
                              style={{ backgroundColor: isHome ? homeColor : awayColor }}
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
                  <div className="text-xs text-muted-foreground space-y-1">
                    {period <= 4 ? (
                      <>
                        <div>
                          <span className="font-semibold">Tiempos muertos Local:</span>{" "}
                          TM 1T {Math.min(teamTimeouts.home.firstHalf, 2)}/2 – 2T {Math.min(teamTimeouts.home.secondHalf, 3)}/3 – Tot {Math.min(teamTimeouts.home.firstHalf + teamTimeouts.home.secondHalf, 5)}/5
                        </div>
                        <div>
                          <span className="font-semibold">Tiempos muertos Visitante:</span>{" "}
                          TM 1T {Math.min(teamTimeouts.away.firstHalf, 2)}/2 – 2T {Math.min(teamTimeouts.away.secondHalf, 3)}/3 – Tot {Math.min(teamTimeouts.away.firstHalf + teamTimeouts.away.secondHalf, 5)}/5
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="font-semibold">Tiempos muertos Local – Prórroga {period - 4}:</span>{" "}
                          {Math.min(teamTimeouts.home.overtime, 1)}/1
                        </div>
                        <div>
                          <span className="font-semibold">Tiempos muertos Visitante – Prórroga {period - 4}:</span>{" "}
                          {Math.min(teamTimeouts.away.overtime, 1)}/1
                        </div>
                      </>
                    )}
                  </div>
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
                    variant="outline"
                    onClick={() => requestTimeout("home")}
                    disabled={
                      match.status !== "en_juego" ||
                      !!pendingReboundTeamId ||
                      !!pendingAssistTeamId ||
                      !!pendingFreeThrow ||
                      !!pendingPersonalFoul ||
                      !!pendingBlock ||
                      !!pendingTurnover
                    }
                  >
                    Tiempo muerto Local
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => requestTimeout("away")}
                    disabled={
                      match.status !== "en_juego" ||
                      !!pendingReboundTeamId ||
                      !!pendingAssistTeamId ||
                      !!pendingFreeThrow ||
                      !!pendingPersonalFoul ||
                      !!pendingBlock ||
                      !!pendingTurnover
                    }
                  >
                    Tiempo muerto Visitante
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
                <div className="rounded-md border p-3 flex flex-col items-center gap-3">
                  <div className="text-center">
                    <div className="text-sm font-semibold">Reloj</div>
                    <div className="text-xs text-muted-foreground">Editar cuando está detenido</div>
                  </div>

                  <div className="h-12 w-[140px] rounded-md border bg-muted/60 flex items-center justify-center font-mono text-2xl font-bold">
                    {formatTime(gameTime)}
                  </div>

                  {showClockEditor && (
                    <div className="flex items-center gap-3 mt-1">
                      {/* Dígitos de minutos y segundos MM:SS */}
                      {[0, 1, 2, 3].map((pos) => {
                        const minutes = Math.floor(gameTime / 60)
                        const seconds = gameTime % 60
                        const str = `${minutes.toString().padStart(2, "0")}${seconds
                          .toString()
                          .padStart(2, "0")}`
                        const digit = str[pos]

                        return (
                          <div key={pos} className="flex flex-col items-center">
                            <button
                              type="button"
                              className="h-5 w-7 flex items-center justify-center text-xs rounded hover:bg-muted disabled:opacity-50"
                              disabled={isRunning}
                              onClick={() => adjustTimeDigit(pos as 0 | 1 | 2 | 3, 1)}
                            >
                              ▲
                            </button>
                            <div className="h-8 w-7 flex items-center justify-center font-mono text-lg font-semibold border rounded">
                              {digit}
                            </div>
                            <button
                              type="button"
                              className="h-5 w-7 flex items-center justify-center text-xs rounded hover:bg-muted disabled:opacity-50"
                              disabled={isRunning}
                              onClick={() => adjustTimeDigit(pos as 0 | 1 | 2 | 3, -1)}
                            >
                              ▼
                            </button>
                          </div>
                        )
                      })}
                      <div className="text-lg font-mono font-semibold">:</div>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isRunning}
                    onClick={() => setShowClockEditor((v) => !v)}
                  >
                    {showClockEditor ? "Cerrar edición" : "Editar"}
                  </Button>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">Colores de equipo (solo este partido)</div>
                  <div className="mt-2 space-y-3 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">Local</span>
                        <span className="text-[11px] truncate max-w-[140px]">{homeTeam.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={homeColor}
                          onChange={(e) => setHomeColorOverride(e.target.value)}
                          className="h-8 w-8 cursor-pointer rounded-full border bg-transparent p-0"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] px-2"
                          onClick={() => setHomeColorOverride(null)}
                          disabled={!homeColorOverride}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">Visitante</span>
                        <span className="text-[11px] truncate max-w-[140px] text-right">{awayTeam.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={awayColor}
                          onChange={(e) => setAwayColorOverride(e.target.value)}
                          className="h-8 w-8 cursor-pointer rounded-full border bg-transparent p-0"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] px-2"
                          onClick={() => setAwayColorOverride(null)}
                          disabled={!awayColorOverride}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
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
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border bg-card overflow-auto">
                <div className="border-b px-3 py-2 text-sm font-semibold">{homeTeam.name} – Estadísticas</div>
                <div className="p-3">
                  <div className="min-w-[520px] overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b text-[11px] text-muted-foreground">
                          <th className="px-2 py-1 text-left w-10">#</th>
                          <th className="px-2 py-1 text-left w-40">Jugador</th>
                          <th className="px-2 py-1 text-right w-12">Pts</th>
                          <th className="px-2 py-1 text-right w-16">Faltas</th>
                          <th className="px-2 py-1 text-right w-16">Reb</th>
                          <th className="px-2 py-1 text-right w-16">Tap</th>
                          <th className="px-2 py-1 text-right w-16">Per</th>
                          <th className="px-2 py-1 text-right w-16">Asis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {homePlayers.map((player, index) => {
                          const { points, fouls, rebounds, blocks, turnovers, assists } = getPlayerStats(player.id)
                          return (
                            <tr
                              key={player.id}
                              className={`border-b last:border-0 ${index % 2 === 0 ? "bg-background" : "bg-muted/40"}`}
                            >
                              <td className="px-2 py-1 text-left font-semibold">{player.jerseyNumber}</td>
                              <td className="px-2 py-1 text-left whitespace-nowrap">{player.lastName.toUpperCase()}, {player.firstName}</td>
                              <td className="px-2 py-1 text-right font-semibold">{points}</td>
                              <td className="px-2 py-1 text-right">{fouls}</td>
                              <td className="px-2 py-1 text-right">{rebounds}</td>
                              <td className="px-2 py-1 text-right">{blocks}</td>
                              <td className="px-2 py-1 text-right">{turnovers}</td>
                              <td className="px-2 py-1 text-right">{assists}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-card overflow-auto">
                <div className="border-b px-3 py-2 text-sm font-semibold">{awayTeam.name} – Estadísticas</div>
                <div className="p-3">
                  <div className="min-w-[520px] overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b text-[11px] text-muted-foreground">
                          <th className="px-2 py-1 text-left w-10">#</th>
                          <th className="px-2 py-1 text-left w-40">Jugador</th>
                          <th className="px-2 py-1 text-right w-12">Pts</th>
                          <th className="px-2 py-1 text-right w-16">Faltas</th>
                          <th className="px-2 py-1 text-right w-16">Reb</th>
                          <th className="px-2 py-1 text-right w-16">Tap</th>
                          <th className="px-2 py-1 text-right w-16">Per</th>
                          <th className="px-2 py-1 text-right w-16">Asis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {awayPlayers.map((player, index) => {
                          const { points, fouls, rebounds, blocks, turnovers, assists } = getPlayerStats(player.id)
                          return (
                            <tr
                              key={player.id}
                              className={`border-b last:border-0 ${index % 2 === 0 ? "bg-background" : "bg-muted/40"}`}
                            >
                              <td className="px-2 py-1 text-left font-semibold">{player.jerseyNumber}</td>
                              <td className="px-2 py-1 text-left whitespace-nowrap">{player.lastName.toUpperCase()}, {player.firstName}</td>
                              <td className="px-2 py-1 text-right font-semibold">{points}</td>
                              <td className="px-2 py-1 text-right">{fouls}</td>
                              <td className="px-2 py-1 text-right">{rebounds}</td>
                              <td className="px-2 py-1 text-right">{blocks}</td>
                              <td className="px-2 py-1 text-right">{turnovers}</td>
                              <td className="px-2 py-1 text-right">{assists}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Diálogo de Tiempo Muerto */}
      <AlertDialog open={timeoutDialogTeamSide !== null} onOpenChange={(open) => {
        if (!open) setTimeoutDialogTeamSide(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar tiempo muerto</AlertDialogTitle>
            <AlertDialogDescription>
              {timeoutDialogTeamSide === "home"
                ? `¿Querés pedir un tiempo muerto para ${homeTeam.name}?`
                : timeoutDialogTeamSide === "away"
                  ? `¿Querés pedir un tiempo muerto para ${awayTeam.name}?`
                  : "¿Querés pedir un tiempo muerto para este equipo?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setTimeoutDialogTeamSide(null)
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!timeoutDialogTeamSide) return
                const ok = requestTimeout(timeoutDialogTeamSide)
                if (ok) {
                  setTimeoutTeamSide(timeoutDialogTeamSide)
                  setTimeoutCountdown(60)
                }
                setTimeoutDialogTeamSide(null)
              }}
            >
              Confirmar tiempo muerto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Advertencia: no se puede iniciar reloj mientras se edita en Configuración */}
      <AlertDialog open={showClockEditorWarning} onOpenChange={setShowClockEditorWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No se puede iniciar el reloj</AlertDialogTitle>
            <AlertDialogDescription>
              Para poner en marcha el reloj primero cerrá la edición del reloj en la pestaña "Configuración".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowClockEditorWarning(false)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* End Match Dialog */}
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar Partido</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmas que deseas finalizar el partido con el marcador actual?
            </AlertDialogDescription>
          </AlertDialogHeader>
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
          </div>
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
            setFreeThrowAttempts({ 1: null, 2: null, 3: null })
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
                setFreeThrowAttempts({ 1: null, 2: null, 3: null })
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
                  setFreeThrowAttempts({ 1: null, 2: null, 3: null })
                  return
                }

                // Jugador y equipo del tirador desde el diálogo
                const playerTeam = getPlayerTeam(freeThrowDialogPlayer.id)
                if (!playerTeam) {
                  setShowFreeThrowDialog(false)
                  setFreeThrowAttempts({ 1: null, 2: null, 3: null })
                  return
                }

                if (match.status !== "en_juego") {
                  setShowFreeThrowDialog(false)
                  setFreeThrowAttempts({ 1: null, 2: null, 3: null })
                  return
                }

                // Limpiar rebote pendiente previo a esta serie
                setPendingReboundTeamId(null)

                const newEvents: MatchEvent[] = []
                sequence.forEach((s, idx) => {
                  const made = s === "made"
                  const ev: MatchEvent = {
                    id: `ev-${Date.now()}-${idx}`,
                    matchId,
                    playerId: freeThrowDialogPlayer.id,
                    teamId: playerTeam.teamId,
                    type: "free_throw",
                    made,
                    period,
                    timestamp: new Date(),
                    gameTime: formatTime(gameTime),
                  }
                  newEvents.push(ev)

                  if (made) {
                    if (playerTeam.teamSide === "home") setHomeScore((prev) => prev + 1)
                    else setAwayScore((prev) => prev + 1)
                  } else if (idx === sequence.length - 1) {
                    // último tiro fallado: rebote pendiente para el equipo del tirador
                    setPendingReboundTeamId(playerTeam.teamId)
                  }
                })

                setLocalEvents((prev) => [...prev, ...newEvents])
                newEvents.forEach((ev) => addMatchEvent(ev))
                setSyncStatus("pending")

                if (!isOnline) {
                  console.log("[events] Free-throw series created offline, marking as pending", {
                    ids: newEvents.map((e) => e.id),
                  })
                  setPendingEventIds((prev) => {
                    const next = [...prev]
                    newEvents.forEach((ev) => {
                      if (!next.includes(ev.id)) next.push(ev.id)
                    })
                    return next
                  })
                } else {
                  void (async () => {
                    const failed: string[] = []
                    for (const ev of newEvents) {
                      const ok = await sendEventToServer(ev)
                      if (!ok) failed.push(ev.id)
                    }
                    if (failed.length) {
                      console.log("[events] Some free-throw events failed to send, marking as pending", { failed })
                      setPendingEventIds((prev) => {
                        const next = [...prev]
                        failed.forEach((id) => {
                          if (!next.includes(id)) next.push(id)
                        })
                        return next
                      })
                    }
                  })()
                }

                setShowFreeThrowDialog(false)
                setFreeThrowAttempts({ 1: null, 2: null, 3: null })
              }}
            >
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Sustituciones */}
      <Dialog open={showSubsDialog} onOpenChange={setShowSubsDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Sustituciones – {subsDialogTeamSide === "home" ? homeTeam.name : awayTeam.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Tocá los jugadores para ponerlos o sacarlos de la cancha. Máximo 5 en cancha.
            </p>
            <div className="flex flex-wrap gap-2">
              {(subsDialogTeamSide === "home" ? homePlayers : awayPlayers).map((player) => {
                const isDisqualified = isEntityDisqualified(player.id)
                const selected = subsSelection.includes(player.id) && !isDisqualified

                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`flex flex-col items-center justify-center rounded-md border px-2 py-1 text-xs min-w-[48px] ${
                      isDisqualified
                        ? "border-red-500 bg-red-50 text-red-700"
                        : selected
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-muted bg-background"
                    }`}
                    disabled={isDisqualified}
                    onClick={() => {
                      if (isDisqualified) return
                      setSubsSelection((prev) => {
                        // Asegurarnos de que ningún expulsado quede en la selección
                        const cleaned = prev.filter((id) => !isEntityDisqualified(id))
                        const isOn = cleaned.includes(player.id)
                        const count = cleaned.length

                        if (isOn) {
                          // No permitir menos de 2 jugadores en cancha
                          if (count <= 2) return cleaned
                          return cleaned.filter((id) => id !== player.id)
                        }

                        // Máximo 5 jugadores en cancha (solo contando habilitados)
                        if (count >= 5) return cleaned

                        return [...cleaned, player.id]
                      })
                    }}
                  >
                    <span className="font-bold">{player.jerseyNumber}</span>
                    <span className="truncate max-w-[72px]">
                      {player.lastName.toUpperCase()}, {player.firstName}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSubsDialog(false)
                setSubsSelection([])
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const teamSide = subsDialogTeamSide
                // Jugadores que consideramos actualmente en cancha: excluir descalificados por seguridad
                const before = onCourtPlayers[teamSide].filter((id) => !isEntityDisqualified(id))
                // Selección final: también ignorar cualquier id descalificado que pudiera haberse colado
                const after = subsSelection.filter((id) => !isEntityDisqualified(id))
                const teamId = teamSide === "home" ? homeTeam.id : awayTeam.id

                const events: MatchEvent[] = []

                // jugadores que salen
                before
                  .filter((id) => !after.includes(id))
                  .forEach((playerId) => {
                    events.push({
                      id: `ev-${Date.now()}-out-${playerId}`,
                      matchId,
                      playerId,
                      teamId,
                      type: "substitution_out",
                      period,
                      timestamp: new Date(),
                      gameTime: formatTime(gameTime),
                    })
                  })

                // jugadores que entran
                after
                  .filter((id) => !before.includes(id))
                  .forEach((playerId) => {
                    events.push({
                      id: `ev-${Date.now()}-in-${playerId}`,
                      matchId,
                      playerId,
                      teamId,
                      type: "substitution_in",
                      period,
                      timestamp: new Date(),
                      gameTime: formatTime(gameTime),
                    })
                  })

                if (events.length) {
                  setLocalEvents((prev) => [...prev, ...events])
                  events.forEach((ev) => addMatchEvent(ev))
                  setSyncStatus("pending")

                  if (!isOnline) {
                    console.log("[events] Substitutions created offline, marking as pending", {
                      ids: events.map((e) => e.id),
                    })
                    setPendingEventIds((prev) => {
                      const next = [...prev]
                      events.forEach((ev) => {
                        if (!next.includes(ev.id)) next.push(ev.id)
                      })
                      return next
                    })
                  } else {
                    void (async () => {
                      const failed: string[] = []
                      for (const ev of events) {
                        const ok = await sendEventToServer(ev)
                        if (!ok) failed.push(ev.id)
                      }
                      if (failed.length) {
                        console.log("[events] Some substitution events failed to send, marking as pending", {
                          failed,
                        })
                        setPendingEventIds((prev) => {
                          const next = [...prev]
                          failed.forEach((id) => {
                            if (!next.includes(id)) next.push(id)
                          })
                          return next
                        })
                      }
                    })()
                  }
                }

                setOnCourtPlayers((prev) => ({ ...prev, [teamSide]: after }))
                setShowSubsDialog(false)
                setSubsSelection([])
              }}
            >
              Aplicar cambios
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
                      disabled={isEntityDisqualified(player.id)}
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
                          disabled={isEntityDisqualified(player.id)}
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
                              disabled={!homeTeam || !awayTeam || isEntityDisqualified(staffIdFull)}
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

                  {/* Sección de falta técnica a la banca */}
                  {selectedFoulType === "technical" && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Banca</div>
                      {(() => {
                        const teamId = selectedFoulTeam === "home" ? homeTeam?.id : awayTeam?.id
                        if (!teamId) return null
                        const benchId = `bench-${teamId}`
                        return (
                          <Button
                            variant="outline"
                            className="w-full justify-start text-xs"
                            onClick={() => {
                              addFoul(benchId, selectedFoulTeam, "technical")
                              setShowOtherFoulDialog(false)
                            }}
                            disabled={isEntityDisqualified(benchId)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-primary">BANCA</span>
                              <span>Falta técnica a la banca</span>
                            </div>
                          </Button>
                        )
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
