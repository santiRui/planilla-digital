import type { Championship, Team, Player, CoachingStaff, Venue, Court, Official, Match, TeamStanding } from "./types"

export const championships: Championship[] = [
  {
    id: "ch1",
    name: "Liga A1 Masculino",
    shortName: "A1M",
    description: "Primera división del básquet masculino salteño",
    year: 2024,
    branch: "masculino",
    status: "activo",
    createdAt: new Date("2024-01-15"),
  },
  {
    id: "ch2",
    name: "Liga A2 Masculino",
    shortName: "A2M",
    description: "Segunda división del básquet masculino salteño",
    year: 2024,
    branch: "masculino",
    status: "activo",
    createdAt: new Date("2024-01-15"),
  },
  {
    id: "ch3",
    name: "Liga A1 Femenino",
    shortName: "A1F",
    description: "Primera división del básquet femenino salteño",
    year: 2024,
    branch: "femenino",
    status: "activo",
    createdAt: new Date("2024-01-15"),
  },
  {
    id: "ch4",
    name: "Torneo +45",
    shortName: "+45",
    description: "Torneo para mayores de 45 años",
    year: 2024,
    branch: "masculino",
    ageGroup: "+45",
    status: "activo",
    createdAt: new Date("2024-02-01"),
  },
  {
    id: "ch5",
    name: "Torneo +35",
    shortName: "+35",
    description: "Torneo para mayores de 35 años",
    year: 2024,
    branch: "masculino",
    ageGroup: "+35",
    status: "pendiente",
    createdAt: new Date("2024-02-15"),
  },
  {
    id: "ch6",
    name: "Liga Sub-21",
    shortName: "U21",
    description: "Liga juvenil Sub-21",
    year: 2024,
    branch: "masculino",
    ageGroup: "U21",
    status: "activo",
    createdAt: new Date("2024-01-20"),
  },
]

export const teams: Team[] = [
  // Liga A1 Masculino teams
  {
    id: "tm1",
    name: "Club Gimnasia y Tiro",
    championshipId: "ch1",
    club: "Gimnasia y Tiro",
    primaryColor: "#1e3a5f",
    secondaryColor: "#ffffff",
  },
  {
    id: "tm2",
    name: "Club Atlético Central Norte",
    championshipId: "ch1",
    club: "Central Norte",
    primaryColor: "#dc2626",
    secondaryColor: "#000000",
  },
  {
    id: "tm3",
    name: "Club Juventud Antoniana",
    championshipId: "ch1",
    club: "Juventud Antoniana",
    primaryColor: "#059669",
    secondaryColor: "#ffffff",
  },
  {
    id: "tm4",
    name: "Club San Martín",
    championshipId: "ch1",
    club: "San Martín",
    primaryColor: "#7c3aed",
    secondaryColor: "#fbbf24",
  },
  {
    id: "tm5",
    name: "Club Sportivo Belgrano",
    championshipId: "ch1",
    club: "Sportivo Belgrano",
    primaryColor: "#0891b2",
    secondaryColor: "#ffffff",
  },
  {
    id: "tm6",
    name: "Club Pellegrini",
    championshipId: "ch1",
    club: "Pellegrini",
    primaryColor: "#be185d",
    secondaryColor: "#fde047",
  },
  {
    id: "tm7",
    name: "Club 20 de Febrero",
    championshipId: "ch1",
    club: "20 de Febrero",
    primaryColor: "#171717",
    secondaryColor: "#a855f7",
  },
  {
    id: "tm8",
    name: "Club Unión Cafayate",
    championshipId: "ch1",
    club: "Unión Cafayate",
    primaryColor: "#b91c1c",
    secondaryColor: "#fcd34d",
  },
  // Liga A1 Femenino teams
  {
    id: "tm9",
    name: "Gimnasia y Tiro Femenino",
    championshipId: "ch3",
    club: "Gimnasia y Tiro",
    primaryColor: "#1e3a5f",
    secondaryColor: "#ffffff",
  },
  {
    id: "tm10",
    name: "Central Norte Femenino",
    championshipId: "ch3",
    club: "Central Norte",
    primaryColor: "#dc2626",
    secondaryColor: "#000000",
  },
  {
    id: "tm11",
    name: "Juventud Antoniana Femenino",
    championshipId: "ch3",
    club: "Juventud Antoniana",
    primaryColor: "#059669",
    secondaryColor: "#ffffff",
  },
  {
    id: "tm12",
    name: "San Martín Femenino",
    championshipId: "ch3",
    club: "San Martín",
    primaryColor: "#7c3aed",
    secondaryColor: "#fbbf24",
  },
]

// Players (sample for team tm1 - Gimnasia y Tiro)
export const players: Player[] = [
  {
    id: "p1",
    teamId: "tm1",
    firstName: "Lucas",
    lastName: "González",
    dni: "40123456",
    birthDate: new Date("2000-03-15"),
    jerseyNumber: 4,
    height: 178,
    isFederated: true,
  },
  {
    id: "p2",
    teamId: "tm1",
    firstName: "Martín",
    lastName: "Rodríguez",
    dni: "40234567",
    birthDate: new Date("1999-07-22"),
    jerseyNumber: 7,
    height: 185,
    isFederated: true,
  },
  {
    id: "p3",
    teamId: "tm1",
    firstName: "Diego",
    lastName: "Fernández",
    dni: "40345678",
    birthDate: new Date("2001-01-10"),
    jerseyNumber: 11,
    height: 192,
    isFederated: true,
  },
  {
    id: "p4",
    teamId: "tm1",
    firstName: "Pablo",
    lastName: "Martínez",
    dni: "40456789",
    birthDate: new Date("2000-11-05"),
    jerseyNumber: 15,
    height: 198,
    isFederated: true,
  },
  {
    id: "p5",
    teamId: "tm1",
    firstName: "Nicolás",
    lastName: "López",
    dni: "40567890",
    birthDate: new Date("1998-05-18"),
    jerseyNumber: 23,
    height: 205,
    isFederated: true,
  },
  {
    id: "p6",
    teamId: "tm1",
    firstName: "Andrés",
    lastName: "García",
    dni: "40678901",
    birthDate: new Date("2002-09-30"),
    jerseyNumber: 8,
    height: 175,
    isFederated: true,
  },
  {
    id: "p7",
    teamId: "tm1",
    firstName: "Tomás",
    lastName: "Sánchez",
    dni: "40789012",
    birthDate: new Date("2001-04-12"),
    jerseyNumber: 13,
    height: 188,
    isFederated: true,
  },
  {
    id: "p8",
    teamId: "tm1",
    firstName: "Federico",
    lastName: "Pérez",
    dni: "40890123",
    birthDate: new Date("2000-08-25"),
    jerseyNumber: 21,
    height: 190,
    isFederated: true,
  },
  {
    id: "p9",
    teamId: "tm1",
    firstName: "Joaquín",
    lastName: "Díaz",
    dni: "40901234",
    birthDate: new Date("1999-12-03"),
    jerseyNumber: 32,
    height: 202,
    isFederated: true,
  },
  {
    id: "p10",
    teamId: "tm1",
    firstName: "Sebastián",
    lastName: "Torres",
    dni: "41012345",
    birthDate: new Date("2002-02-14"),
    jerseyNumber: 5,
    height: 195,
    isFederated: false,
  },
  // Team 2 players - Central Norte
  {
    id: "p11",
    teamId: "tm2",
    firstName: "Carlos",
    lastName: "Vega",
    dni: "41123456",
    birthDate: new Date("2000-06-20"),
    jerseyNumber: 1,
    height: 180,
    isFederated: true,
  },
  {
    id: "p12",
    teamId: "tm2",
    firstName: "Roberto",
    lastName: "Silva",
    dni: "41234567",
    birthDate: new Date("1999-10-08"),
    jerseyNumber: 3,
    height: 186,
    isFederated: true,
  },
  {
    id: "p13",
    teamId: "tm2",
    firstName: "Alejandro",
    lastName: "Romero",
    dni: "41345678",
    birthDate: new Date("2001-03-25"),
    jerseyNumber: 10,
    height: 191,
    isFederated: true,
  },
  {
    id: "p14",
    teamId: "tm2",
    firstName: "Matías",
    lastName: "Herrera",
    dni: "41456789",
    birthDate: new Date("2000-07-15"),
    jerseyNumber: 14,
    height: 196,
    isFederated: true,
  },
  {
    id: "p15",
    teamId: "tm2",
    firstName: "Emiliano",
    lastName: "Castro",
    dni: "41567890",
    birthDate: new Date("1998-11-30"),
    jerseyNumber: 25,
    height: 203,
    isFederated: true,
  },
  {
    id: "p16",
    teamId: "tm2",
    firstName: "Facundo",
    lastName: "Morales",
    dni: "41678901",
    birthDate: new Date("2002-01-18"),
    jerseyNumber: 6,
    height: 177,
    isFederated: true,
  },
  {
    id: "p17",
    teamId: "tm2",
    firstName: "Ignacio",
    lastName: "Ruiz",
    dni: "41789012",
    birthDate: new Date("2001-05-22"),
    jerseyNumber: 9,
    height: 184,
    isFederated: true,
  },
  {
    id: "p18",
    teamId: "tm2",
    firstName: "Gonzalo",
    lastName: "Medina",
    dni: "41890123",
    birthDate: new Date("2000-09-10"),
    jerseyNumber: 12,
    height: 189,
    isFederated: true,
  },
]

// Coaching Staff
export const coachingStaff: CoachingStaff[] = [
  {
    id: "cs1",
    teamId: "tm1",
    firstName: "Ricardo",
    lastName: "Molina",
    role: "tecnico",
    phone: "1155667788",
    email: "rmolina@email.com",
  },
  { id: "cs2", teamId: "tm1", firstName: "Jorge", lastName: "Aguirre", role: "asistente", phone: "1166778899" },
  { id: "cs3", teamId: "tm1", firstName: "Miguel", lastName: "Paz", role: "delegado", phone: "1177889900" },
  {
    id: "cs4",
    teamId: "tm2",
    firstName: "Mario",
    lastName: "Benítez",
    role: "tecnico",
    phone: "1177889900",
    email: "mbenitez@email.com",
  },
  { id: "cs5", teamId: "tm2", firstName: "Oscar", lastName: "Fernández", role: "asistente", phone: "1188990011" },
]

// Venues
export const venues: Venue[] = [
  { id: "v1", name: "Estadio Delmi", address: "Av. Belgrano 1500, Salta", courts: [] },
  { id: "v2", name: "Gimnasio Municipal Limache", address: "Calle Limache 200, Salta", courts: [] },
  { id: "v3", name: "Club Gimnasia y Tiro", address: "Av. San Martín 800, Salta", courts: [] },
  { id: "v4", name: "Club Central Norte", address: "Av. Tavella 1200, Salta", courts: [] },
]

// Courts
export const courts: Court[] = [
  { id: "ct1", venueId: "v1", name: "Cancha Principal" },
  { id: "ct2", venueId: "v2", name: "Cancha 1" },
  { id: "ct3", venueId: "v2", name: "Cancha 2" },
  { id: "ct4", venueId: "v3", name: "Cancha Techada" },
  { id: "ct5", venueId: "v4", name: "Cancha Principal" },
]

// Officials
export const officials: Official[] = [
  {
    id: "of1",
    firstName: "Gabriel",
    lastName: "Muñoz",
    role: "arbitro",
    email: "gmunoz@email.com",
    phone: "1122334455",
  },
  {
    id: "of2",
    firstName: "Fernando",
    lastName: "Ríos",
    role: "arbitro",
    email: "frios@email.com",
    phone: "1133445566",
  },
  { id: "of3", firstName: "Marcelo", lastName: "Paz", role: "arbitro", email: "mpaz@email.com", phone: "1144556677" },
  {
    id: "of4",
    firstName: "Laura",
    lastName: "Giménez",
    role: "oficial_mesa",
    email: "lgimenez@email.com",
    phone: "1155667788",
  },
  {
    id: "of5",
    firstName: "Ana",
    lastName: "Córdoba",
    role: "oficial_mesa",
    email: "acordoba@email.com",
    phone: "1166778899",
  },
  {
    id: "of6",
    firstName: "María",
    lastName: "Sosa",
    role: "oficial_mesa",
    email: "msosa@email.com",
    phone: "1177889900",
  },
]

export const matches: Match[] = [
  // Round 1 - Liga A1 Masculino
  {
    id: "m1",
    categoryId: "ch1",
    homeTeamId: "tm1",
    awayTeamId: "tm2",
    round: 1,
    phase: "fase_regular",
    status: "finalizado",
    scheduledDate: new Date("2024-03-02"),
    scheduledTime: "21:00",
    venueId: "v1",
    courtId: "ct1",
    refereeIds: ["of1", "of2"],
    tableOfficialIds: ["of4"],
    homeScore: 78,
    awayScore: 72,
  },
  {
    id: "m2",
    categoryId: "ch1",
    homeTeamId: "tm3",
    awayTeamId: "tm4",
    round: 1,
    phase: "fase_regular",
    status: "finalizado",
    scheduledDate: new Date("2024-03-02"),
    scheduledTime: "19:00",
    venueId: "v1",
    courtId: "ct1",
    refereeIds: ["of1", "of3"],
    tableOfficialIds: ["of5"],
    homeScore: 65,
    awayScore: 70,
  },
  {
    id: "m3",
    categoryId: "ch1",
    homeTeamId: "tm5",
    awayTeamId: "tm6",
    round: 1,
    phase: "fase_regular",
    status: "finalizado",
    scheduledDate: new Date("2024-03-03"),
    scheduledTime: "20:00",
    venueId: "v2",
    courtId: "ct2",
    refereeIds: ["of2", "of3"],
    tableOfficialIds: ["of6"],
    homeScore: 82,
    awayScore: 79,
  },
  {
    id: "m4",
    categoryId: "ch1",
    homeTeamId: "tm7",
    awayTeamId: "tm8",
    round: 1,
    phase: "fase_regular",
    status: "finalizado",
    scheduledDate: new Date("2024-03-03"),
    scheduledTime: "22:00",
    venueId: "v2",
    courtId: "ct2",
    refereeIds: ["of1"],
    tableOfficialIds: ["of4"],
    homeScore: 68,
    awayScore: 75,
  },
  // Round 2
  {
    id: "m5",
    categoryId: "ch1",
    homeTeamId: "tm1",
    awayTeamId: "tm3",
    round: 2,
    phase: "fase_regular",
    status: "finalizado",
    scheduledDate: new Date("2024-03-09"),
    scheduledTime: "21:00",
    venueId: "v3",
    courtId: "ct4",
    refereeIds: ["of2"],
    tableOfficialIds: ["of5"],
    homeScore: 85,
    awayScore: 71,
  },
  {
    id: "m6",
    categoryId: "ch1",
    homeTeamId: "tm2",
    awayTeamId: "tm5",
    round: 2,
    phase: "fase_regular",
    status: "finalizado",
    scheduledDate: new Date("2024-03-09"),
    scheduledTime: "19:00",
    venueId: "v4",
    courtId: "ct5",
    refereeIds: ["of1", "of3"],
    tableOfficialIds: ["of6"],
    homeScore: 77,
    awayScore: 80,
  },
  {
    id: "m7",
    categoryId: "ch1",
    homeTeamId: "tm4",
    awayTeamId: "tm7",
    round: 2,
    phase: "fase_regular",
    status: "en_juego",
    scheduledDate: new Date("2024-03-10"),
    scheduledTime: "20:00",
    venueId: "v1",
    courtId: "ct1",
    refereeIds: ["of2", "of3"],
    tableOfficialIds: ["of4"],
    homeScore: 45,
    awayScore: 42,
  },
  {
    id: "m8",
    categoryId: "ch1",
    homeTeamId: "tm6",
    awayTeamId: "tm8",
    round: 2,
    phase: "fase_regular",
    status: "programado",
    scheduledDate: new Date("2024-03-10"),
    scheduledTime: "22:00",
    venueId: "v1",
    courtId: "ct1",
    refereeIds: ["of1"],
    tableOfficialIds: ["of5"],
  },
  // Round 3 (not scheduled)
  {
    id: "m9",
    categoryId: "ch1",
    homeTeamId: "tm1",
    awayTeamId: "tm4",
    round: 3,
    phase: "fase_regular",
    status: "programado",
    refereeIds: [],
    tableOfficialIds: [],
  },
  {
    id: "m10",
    categoryId: "ch1",
    homeTeamId: "tm2",
    awayTeamId: "tm6",
    round: 3,
    phase: "fase_regular",
    status: "programado",
    refereeIds: [],
    tableOfficialIds: [],
  },
]

// Team Standings for Liga A1 Masculino
export const standings: TeamStanding[] = [
  { teamId: "tm1", categoryId: "ch1", played: 2, won: 2, lost: 0, pointsFor: 163, pointsAgainst: 143, points: 4 },
  { teamId: "tm5", categoryId: "ch1", played: 2, won: 2, lost: 0, pointsFor: 162, pointsAgainst: 156, points: 4 },
  { teamId: "tm4", categoryId: "ch1", played: 1, won: 1, lost: 0, pointsFor: 70, pointsAgainst: 65, points: 2 },
  { teamId: "tm8", categoryId: "ch1", played: 1, won: 1, lost: 0, pointsFor: 75, pointsAgainst: 68, points: 2 },
  { teamId: "tm2", categoryId: "ch1", played: 2, won: 0, lost: 2, pointsFor: 149, pointsAgainst: 158, points: 0 },
  { teamId: "tm3", categoryId: "ch1", played: 2, won: 0, lost: 2, pointsFor: 136, pointsAgainst: 155, points: 0 },
  { teamId: "tm6", categoryId: "ch1", played: 1, won: 0, lost: 1, pointsFor: 79, pointsAgainst: 82, points: 0 },
  { teamId: "tm7", categoryId: "ch1", played: 1, won: 0, lost: 1, pointsFor: 68, pointsAgainst: 75, points: 0 },
]

// Helper functions
export function getTeamById(id: string): Team | undefined {
  return teams.find((t) => t.id === id)
}

export function getChampionshipById(id: string): Championship | undefined {
  return championships.find((c) => c.id === id)
}

export function getPlayersByTeam(teamId: string): Player[] {
  return players.filter((p) => p.teamId === teamId)
}

export function getTeamsByChampionship(championshipId: string): Team[] {
  return teams.filter((t) => t.championshipId === championshipId)
}

export function getMatchesByChampionship(championshipId: string): Match[] {
  return matches.filter((m) => m.categoryId === championshipId)
}

export function getStandingsByChampionship(championshipId: string): TeamStanding[] {
  return standings
    .filter((s) => s.categoryId === championshipId)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const aDiff = a.pointsFor - a.pointsAgainst
      const bDiff = b.pointsFor - b.pointsAgainst
      return bDiff - aDiff
    })
}

export function getCoachingStaffByTeam(teamId: string): CoachingStaff[] {
  return coachingStaff.filter((cs) => cs.teamId === teamId)
}

export function getVenueById(id: string): Venue | undefined {
  return venues.find((v) => v.id === id)
}

export function getCourtById(id: string): Court | undefined {
  return courts.find((c) => c.id === id)
}

export function getOfficialById(id: string): Official | undefined {
  return officials.find((o) => o.id === id)
}
