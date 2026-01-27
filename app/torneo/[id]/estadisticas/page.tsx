"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trophy, ArrowLeft, BarChart3, Users, User } from "lucide-react"
import { useAppStore } from "@/lib/store"

export default function TournamentStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { tournaments, teams, players, standings } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [activeTab, setActiveTab] = useState("players")

  const tournament = tournaments.find((t) => t.id === id)
  const tournamentTeams = teams.filter((t) => t.championshipId === id)

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold">Torneo no encontrado</h2>
          <Button className="mt-4" onClick={() => router.push("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al inicio
          </Button>
        </Card>
      </div>
    )
  }

  const getTeamById = (teamId: string) => teams.find((t) => t.id === teamId)

  // Filter players by tournament
  const tournamentPlayers = players.filter((p) => tournamentTeams.some((t) => t.id === p.teamId))

  const filteredPlayers = tournamentPlayers

  // Sort players by points (mock stat calculation)
  const playerStats = filteredPlayers
    .map((player) => {
      const team = getTeamById(player.teamId)
      return {
        ...player,
        teamName: team?.name || "Sin equipo",
        teamColor: team?.primaryColor || "#6366f1",
        points: Math.floor(Math.random() * 150) + 20,
        gamesPlayed: Math.floor(Math.random() * 10) + 3,
        fouls: Math.floor(Math.random() * 15) + 2,
      }
    })
    .sort((a, b) => b.points - a.points)

  // Team stats
  const filteredTeams = tournamentTeams

  const teamStats = filteredTeams
    .map((team) => {
      const teamStanding = standings.find((s) => s.teamId === team.id && s.categoryId === id)
      const teamPlayers = players.filter((p) => p.teamId === team.id)
      return {
        ...team,
        ...teamStanding,
        playerCount: teamPlayers.length,
        avgPoints: teamStanding ? Math.round(teamStanding.pointsFor / Math.max(teamStanding.played, 1)) : 0,
        avgAgainst: teamStanding ? Math.round(teamStanding.pointsAgainst / Math.max(teamStanding.played, 1)) : 0,
      }
    })
    .sort((a, b) => (b.avgPoints || 0) - (a.avgPoints || 0))

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/torneo/${id}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Trophy className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg hidden sm:block">GETOBA</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Page Header */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-6 w-6" />
            <h1 className="text-2xl font-bold sm:text-3xl">Estadísticas</h1>
          </div>
          <p className="text-primary-foreground/80">{tournament.name}</p>
        </div>
      </section>

      {/* Filters */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Categoría:</label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Stats Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="players" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Jugadores
            </TabsTrigger>
            <TabsTrigger value="teams" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Equipos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="space-y-6">
            {/* Top Scorers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Goleadores
                </CardTitle>
              </CardHeader>
              <CardContent>
                {playerStats.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay estadísticas de jugadores disponibles</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Jugador</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead className="text-center">PJ</TableHead>
                          <TableHead className="text-center">PTS</TableHead>
                          <TableHead className="text-center">PPP</TableHead>
                          <TableHead className="text-center">Faltas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {playerStats.slice(0, 15).map((player, index) => (
                          <TableRow key={player.id}>
                            <TableCell className="text-center font-medium">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                  {player.jerseyNumber}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {player.firstName} {player.lastName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: player.teamColor }} />
                                <span className="text-sm">{player.teamName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{player.gamesPlayed}</TableCell>
                            <TableCell className="text-center font-bold">{player.points}</TableCell>
                            <TableCell className="text-center">
                              {(player.points / player.gamesPlayed).toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center">{player.fouls}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teams" className="space-y-6">
            {/* Team Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Estadísticas por Equipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {teamStats.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay estadísticas de equipos disponibles</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead className="text-center">Jugadores</TableHead>
                          <TableHead className="text-center">PJ</TableHead>
                          <TableHead className="text-center">PPP</TableHead>
                          <TableHead className="text-center">PCP</TableHead>
                          <TableHead className="text-center">DIF/P</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamStats.map((team, index) => (
                          <TableRow key={team.id}>
                            <TableCell className="text-center font-medium">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div
                                  className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                                  style={{ backgroundColor: team.primaryColor || "#6366f1" }}
                                >
                                  {team.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium">{team.name}</p>
                                  <p className="text-xs text-muted-foreground">{team.club}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{team.playerCount}</TableCell>
                            <TableCell className="text-center">{team.played || 0}</TableCell>
                            <TableCell className="text-center font-bold text-green-600">{team.avgPoints}</TableCell>
                            <TableCell className="text-center text-red-600">{team.avgAgainst}</TableCell>
                            <TableCell className="text-center font-medium">
                              {team.avgPoints - team.avgAgainst > 0 ? "+" : ""}
                              {team.avgPoints - team.avgAgainst}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
