// Core data types for the basketball tournament management system

export type Branch = "masculino" | "femenino" | "mixto"
export type MatchStatus = "programado" | "en_juego" | "finalizado" | "suspendido" | "demorado"
export type TournamentPhase = "fase_regular" | "playoff" | "cuartos" | "semifinal" | "final"
export type UserRole = "admin" | "arbitro" | "oficial_mesa"

export interface Championship {
  id: string
  name: string
  shortName: string // Liga A1, Liga A2, etc.
  description?: string
  year: number
  branch: Branch
  ageGroup?: string // +45, +35, Sub21, etc.
  status: "activo" | "finalizado" | "pendiente"
  createdAt: Date
}

export interface Category {
  id: string
  name: string
  championshipId: string
  branch: Branch
  ageGroup: string
}

export interface Team {
  id: string
  name: string
  championshipId: string
  logo?: string
  club: string
  primaryColor: string
  secondaryColor: string
}

export interface Player {
  id: string
  teamId: string
  firstName: string
  lastName: string
  dni: string
  birthDate: Date
  jerseyNumber: number
  height?: number // in cm
  isFederated: boolean
  photoUrl?: string
}

export interface CoachingStaff {
  id: string
  teamId: string
  firstName: string
  lastName: string
  role: "tecnico" | "asistente" | "delegado"
  phone?: string
  email?: string
}

export interface Venue {
  id: string
  name: string
  address: string
  courts: Court[]
}

export interface Court {
  id: string
  venueId: string
  name: string
}

export interface Official {
  id: string
  firstName: string
  lastName: string
  role: UserRole
  email: string
  phone?: string
}

export interface Match {
  id: string
  categoryId: string
  homeTeamId: string
  awayTeamId: string
  round: number // Fecha 1, Fecha 2, etc.
  phase: TournamentPhase
  status: MatchStatus
  scheduledDate?: Date
  scheduledTime?: string
  venueId?: string
  courtId?: string
  refereeIds: string[]
  tableOfficialIds: string[]
  homeScore?: number
  awayScore?: number
}

export interface MatchEvent {
  id: string
  matchId: string
  playerId: string
  teamId: string
  type:
    | "points"
    | "shot"
    | "free_throw"
    | "rebound"
    | "assist"
    | "turnover"
    | "steal"
    | "block"
    | "foul"
    | "timeout"
    | "substitution_in"
    | "substitution_out"
  points?: 1 | 2 | 3
  shotType?: 2 | 3
  made?: boolean
  x?: number
  y?: number
  reboundType?: "offensive" | "defensive"
  foulType?: "personal" | "technical" | "unsportsmanlike" | "disqualifying" | "fight"
  period: number
  timestamp: Date
  gameTime: string // MM:SS
}

export interface PlayerStats {
  playerId: string
  matchId: string
  points: number
  fouls: number
  freeThrows: number
  twoPointers: number
  threePointers: number
}

export interface TeamStanding {
  teamId: string
  categoryId: string
  played: number
  won: number
  lost: number
  pointsFor: number
  pointsAgainst: number
  points: number // Tournament points
}

export interface FixtureRound {
  round: number
  matches: Match[]
}
