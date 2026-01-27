"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  Championship,
  Team,
  Player,
  CoachingStaff,
  Match,
  MatchEvent,
  TeamStanding,
  Official,
  Venue,
  Court,
  UserRole,
} from "./types"
import {
  championships as initialChampionships,
  teams as initialTeams,
  players as initialPlayers,
  coachingStaff as initialCoachingStaff,
  matches as initialMatches,
  standings as initialStandings,
  officials as initialOfficials,
  venues as initialVenues,
  courts as initialCourts,
} from "./mock-data"

interface AppState {
  // Auth
  currentUser: { id: string; role: UserRole; name: string } | null
  setCurrentUser: (user: { id: string; role: UserRole; name: string } | null) => void

  // Data
  championships: Championship[]
  tournaments: Championship[]
  categories: Championship[]
  teams: Team[]
  players: Player[]
  coachingStaff: CoachingStaff[]
  matches: Match[]
  matchEvents: MatchEvent[]
  standings: TeamStanding[]
  officials: Official[]
  venues: Venue[]
  courts: Court[]

  // Championship Actions
  addChampionship: (championship: Championship) => void
  updateChampionship: (id: string, data: Partial<Championship>) => void

  // Back-compat aliases
  addTournament: (tournament: Championship) => void
  updateTournament: (id: string, data: Partial<Championship>) => void

  // Team Actions
  addTeam: (team: Team) => void
  updateTeam: (id: string, data: Partial<Team>) => void

  // Player Actions
  addPlayer: (player: Player) => void
  updatePlayer: (id: string, data: Partial<Player>) => void

  // Coach Actions
  addCoach: (coach: CoachingStaff) => void
  updateCoach: (id: string, data: Partial<CoachingStaff>) => void

  // Match Actions
  addMatch: (match: Match) => void
  updateMatch: (id: string, data: Partial<Match>) => void
  addMatchEvent: (event: MatchEvent) => void
  removeLastMatchEvent: (matchId: string) => void

  // Standing Actions
  updateStandings: (championshipId: string) => void

  // Fixture Generation
  generateFixture: (championshipId: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),

      // Initial Data
      championships: initialChampionships,
      tournaments: initialChampionships,
      categories: initialChampionships,
      teams: initialTeams,
      players: initialPlayers,
      coachingStaff: initialCoachingStaff,
      matches: initialMatches,
      matchEvents: [],
      standings: initialStandings,
      officials: initialOfficials,
      venues: initialVenues,
      courts: initialCourts,

      // Championship Actions
      addChampionship: (championship) =>
        set((state) => {
          const next = [...state.championships, championship]
          return {
            championships: next,
            tournaments: next,
            categories: next,
          }
        }),
      updateChampionship: (id, data) =>
        set((state) => {
          const next = state.championships.map((c) => (c.id === id ? { ...c, ...data } : c))
          return {
            championships: next,
            tournaments: next,
            categories: next,
          }
        }),

      addTournament: (tournament) => get().addChampionship(tournament),
      updateTournament: (id, data) => get().updateChampionship(id, data),

      // Team Actions
      addTeam: (team) => set((state) => ({ teams: [...state.teams, team] })),
      updateTeam: (id, data) =>
        set((state) => ({
          teams: state.teams.map((t) => (t.id === id ? { ...t, ...data } : t)),
        })),

      // Player Actions
      addPlayer: (player) => set((state) => ({ players: [...state.players, player] })),
      updatePlayer: (id, data) =>
        set((state) => ({
          players: state.players.map((p) => (p.id === id ? { ...p, ...data } : p)),
        })),

      // Coach Actions
      addCoach: (coach) => set((state) => ({ coachingStaff: [...state.coachingStaff, coach] })),
      updateCoach: (id, data) =>
        set((state) => ({
          coachingStaff: state.coachingStaff.map((c) => (c.id === id ? { ...c, ...data } : c)),
        })),

      // Match Actions
      addMatch: (match) => set((state) => ({ matches: [...state.matches, match] })),
      updateMatch: (id, data) =>
        set((state) => ({
          matches: state.matches.map((m) => (m.id === id ? { ...m, ...data } : m)),
        })),
      addMatchEvent: (event) => set((state) => ({ matchEvents: [...state.matchEvents, event] })),
      removeLastMatchEvent: (matchId) =>
        set((state) => {
          const events = state.matchEvents.filter((e) => e.matchId === matchId)
          if (events.length === 0) return state
          const lastEvent = events[events.length - 1]
          return {
            matchEvents: state.matchEvents.filter((e) => e.id !== lastEvent.id),
          }
        }),

      // Standing Actions
      updateStandings: (championshipId) => {
        const state = get()
        const championshipMatches = state.matches.filter(
          (m) => m.categoryId === championshipId && m.status === "finalizado",
        )
        const championshipTeams = state.teams.filter((t) => t.championshipId === championshipId)

        const newStandings: TeamStanding[] = championshipTeams.map((team) => {
          const teamMatches = championshipMatches.filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)

          let won = 0,
            lost = 0,
            pointsFor = 0,
            pointsAgainst = 0

          teamMatches.forEach((match) => {
            const isHome = match.homeTeamId === team.id
            const teamScore = isHome ? match.homeScore! : match.awayScore!
            const opponentScore = isHome ? match.awayScore! : match.homeScore!

            pointsFor += teamScore
            pointsAgainst += opponentScore

            if (teamScore > opponentScore) won++
            else lost++
          })

          return {
            teamId: team.id,
            categoryId: championshipId,
            played: teamMatches.length,
            won,
            lost,
            pointsFor,
            pointsAgainst,
            points: won * 2,
          }
        })

        set((state) => ({
          standings: [...state.standings.filter((s) => s.categoryId !== championshipId), ...newStandings],
        }))
      },

      // Fixture Generation
      generateFixture: (championshipId) => {
        const state = get()
        const championshipTeams = state.teams.filter((t) => t.championshipId === championshipId)

        if (championshipTeams.length < 2) return

        // Round-robin algorithm
        const teams = [...championshipTeams]
        if (teams.length % 2 !== 0) {
          teams.push({ id: "bye", name: "BYE" } as Team)
        }

        const rounds = teams.length - 1
        const matchesPerRound = teams.length / 2
        const newMatches: Match[] = []

        for (let round = 0; round < rounds; round++) {
          for (let match = 0; match < matchesPerRound; match++) {
            const home = teams[match]
            const away = teams[teams.length - 1 - match]

            if (home.id !== "bye" && away.id !== "bye") {
              newMatches.push({
                id: `gen-${championshipId}-${round}-${match}`,
                categoryId: championshipId,
                homeTeamId: home.id,
                awayTeamId: away.id,
                round: round + 1,
                phase: "fase_regular",
                status: "programado",
                refereeIds: [],
                tableOfficialIds: [],
              })
            }
          }

          // Rotate teams (keep first team fixed)
          const lastTeam = teams.pop()!
          teams.splice(1, 0, lastTeam)
        }

        // Remove existing matches for this championship and add new ones
        set((state) => ({
          matches: [...state.matches.filter((m) => m.categoryId !== championshipId), ...newMatches],
        }))
      },
    }),
    {
      name: "labas-tournament-storage",
    },
  ),
)
