"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAppStore } from "@/lib/store"
import { Trophy, Target, AlertTriangle, TrendingUp, Users } from "lucide-react"

export default function EstadisticasPage() {
  const { matchEvents, players, teams, categories, matches } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id || "")

  // Get teams in this category
  const categoryTeams = teams.filter((t) => t.categoryId === selectedCategory)
  const categoryTeamIds = categoryTeams.map((t) => t.id)

  // Get players in this category
  const categoryPlayers = players.filter((p) => categoryTeamIds.includes(p.teamId))

  // Calculate player stats from match events
  const playerStats = useMemo(() => {
    const stats: Record<string, { points: number; fouls: number; games: Set<string> }> = {}

    matchEvents.forEach((event) => {
      const player = players.find((p) => p.id === event.playerId)
      if (!player || !categoryTeamIds.includes(player.teamId)) return

      if (!stats[event.playerId]) {
        stats[event.playerId] = { points: 0, fouls: 0, games: new Set() }
      }

      stats[event.playerId].games.add(event.matchId)

      if (event.type === "points" && event.points) {
        stats[event.playerId].points += event.points
      } else if (event.type === "foul") {
        stats[event.playerId].fouls += 1
      }
    })

    return stats
  }, [matchEvents, players, categoryTeamIds])

  // Top scorers
  const topScorers = useMemo(() => {
    return categoryPlayers
      .map((player) => ({
        player,
        team: teams.find((t) => t.id === player.teamId),
        points: playerStats[player.id]?.points || 0,
        games: playerStats[player.id]?.games.size || 0,
      }))
      .filter((p) => p.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 10)
  }, [categoryPlayers, playerStats, teams])

  // Most fouls (for stats)
  const mostFouls = useMemo(() => {
    return categoryPlayers
      .map((player) => ({
        player,
        team: teams.find((t) => t.id === player.teamId),
        fouls: playerStats[player.id]?.fouls || 0,
        games: playerStats[player.id]?.games.size || 0,
      }))
      .filter((p) => p.fouls > 0)
      .sort((a, b) => b.fouls - a.fouls)
      .slice(0, 10)
  }, [categoryPlayers, playerStats, teams])

  // Team stats
  const teamStats = useMemo(() => {
    const categoryMatches = matches.filter((m) => m.categoryId === selectedCategory && m.status === "finalizado")

    return categoryTeams
      .map((team) => {
        const teamMatches = categoryMatches.filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
        let pointsFor = 0
        let pointsAgainst = 0

        teamMatches.forEach((match) => {
          if (match.homeTeamId === team.id) {
            pointsFor += match.homeScore || 0
            pointsAgainst += match.awayScore || 0
          } else {
            pointsFor += match.awayScore || 0
            pointsAgainst += match.homeScore || 0
          }
        })

        const games = teamMatches.length
        return {
          team,
          games,
          pointsFor,
          pointsAgainst,
          avgFor: games > 0 ? (pointsFor / games).toFixed(1) : "0.0",
          avgAgainst: games > 0 ? (pointsAgainst / games).toFixed(1) : "0.0",
        }
      })
      .sort((a, b) => Number(b.avgFor) - Number(a.avgFor))
  }, [matches, categoryTeams, selectedCategory])

  const getTeam = (id: string) => teams.find((t) => t.id === id)

  // Summary cards data
  const summaryData = useMemo(() => {
    const categoryMatches = matches.filter((m) => m.categoryId === selectedCategory && m.status === "finalizado")
    const totalPoints = categoryMatches.reduce((acc, m) => acc + (m.homeScore || 0) + (m.awayScore || 0), 0)
    const gamesPlayed = categoryMatches.length

    return {
      totalGames: gamesPlayed,
      totalPoints,
      avgPointsPerGame: gamesPlayed > 0 ? (totalPoints / gamesPlayed).toFixed(1) : "0",
      totalPlayers: categoryPlayers.length,
    }
  }, [matches, selectedCategory, categoryPlayers])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Estadísticas</h1>
          <p className="text-muted-foreground mt-1">Rendimiento de jugadores y equipos</p>
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Seleccionar categoría" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-primary/10 p-3 text-primary">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summaryData.totalGames}</p>
              <p className="text-sm text-muted-foreground">Partidos Jugados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-accent/10 p-3 text-accent">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summaryData.totalPoints}</p>
              <p className="text-sm text-muted-foreground">Puntos Totales</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-[var(--color-success)]/10 p-3 text-[var(--color-success)]">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summaryData.avgPointsPerGame}</p>
              <p className="text-sm text-muted-foreground">Prom. Pts/Partido</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-[var(--color-warning)]/10 p-3 text-[var(--color-warning)]">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summaryData.totalPlayers}</p>
              <p className="text-sm text-muted-foreground">Jugadores</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Tables */}
      <Tabs defaultValue="scorers" className="space-y-6">
        <TabsList>
          <TabsTrigger value="scorers">Goleadores</TabsTrigger>
          <TabsTrigger value="teams">Equipos</TabsTrigger>
          <TabsTrigger value="fouls">Faltas</TabsTrigger>
        </TabsList>

        <TabsContent value="scorers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Máximos Anotadores
              </CardTitle>
              <CardDescription>Ranking de jugadores con más puntos en el torneo</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topScorers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No hay estadísticas de anotadores disponibles
                        </TableCell>
                      </TableRow>
                    ) : (
                      topScorers.map((item, index) => (
                        <TableRow key={item.player.id}>
                          <TableCell className="text-center font-semibold">
                            {index === 0 && <Trophy className="h-4 w-4 text-[var(--color-warning)] mx-auto" />}
                            {index > 0 && index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                {item.player.jerseyNumber}
                              </span>
                              <span className="font-medium">
                                {item.player.firstName} {item.player.lastName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ backgroundColor: item.team?.primaryColor || "#666" }}
                              >
                                {item.team?.name.substring(0, 1) || "?"}
                              </div>
                              <span className="text-sm text-muted-foreground">{item.team?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{item.games}</TableCell>
                          <TableCell className="text-center font-bold text-lg">{item.points}</TableCell>
                          <TableCell className="text-center">
                            {item.games > 0 ? (item.points / item.games).toFixed(1) : "0.0"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Estadísticas por Equipo
              </CardTitle>
              <CardDescription>Promedios ofensivos y defensivos de cada equipo</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipo</TableHead>
                      <TableHead className="text-center">PJ</TableHead>
                      <TableHead className="text-center">PF</TableHead>
                      <TableHead className="text-center">PC</TableHead>
                      <TableHead className="text-center">PPP</TableHead>
                      <TableHead className="text-center">PRP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamStats.map((item) => (
                      <TableRow key={item.team.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              style={{ backgroundColor: item.team.primaryColor }}
                            >
                              {item.team.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium">{item.team.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{item.games}</TableCell>
                        <TableCell className="text-center">{item.pointsFor}</TableCell>
                        <TableCell className="text-center">{item.pointsAgainst}</TableCell>
                        <TableCell className="text-center font-semibold text-[var(--color-success)]">
                          {item.avgFor}
                        </TableCell>
                        <TableCell className="text-center text-destructive">{item.avgAgainst}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fouls">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[var(--color-warning)]" />
                Registro de Faltas
              </CardTitle>
              <CardDescription>Jugadores con más faltas personales</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Jugador</TableHead>
                      <TableHead>Equipo</TableHead>
                      <TableHead className="text-center">PJ</TableHead>
                      <TableHead className="text-center">Faltas</TableHead>
                      <TableHead className="text-center">FPP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mostFouls.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No hay estadísticas de faltas disponibles
                        </TableCell>
                      </TableRow>
                    ) : (
                      mostFouls.map((item, index) => (
                        <TableRow key={item.player.id}>
                          <TableCell className="text-center font-semibold">{index + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                {item.player.jerseyNumber}
                              </span>
                              <span className="font-medium">
                                {item.player.firstName} {item.player.lastName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ backgroundColor: item.team?.primaryColor || "#666" }}
                              >
                                {item.team?.name.substring(0, 1) || "?"}
                              </div>
                              <span className="text-sm text-muted-foreground">{item.team?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{item.games}</TableCell>
                          <TableCell className="text-center font-bold text-[var(--color-warning)]">
                            {item.fouls}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.games > 0 ? (item.fouls / item.games).toFixed(1) : "0.0"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
        <span>
          PJ: Partidos Jugados | PTS: Puntos | PPP: Puntos Por Partido | PF: Puntos a Favor | PC: Puntos en Contra |
          PRP: Puntos Recibidos Por Partido | FPP: Faltas Por Partido
        </span>
      </div>
    </div>
  )
}
