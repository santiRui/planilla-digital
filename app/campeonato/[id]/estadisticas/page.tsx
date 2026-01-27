"use client"

import { use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Activity, ArrowLeft, BarChart3, Trophy, Target, TrendingUp } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getChampionshipById, getTeamById, getTeamsByChampionship, players } from "@/lib/mock-data"

interface EstadisticasPageProps {
  params: Promise<{ id: string }>
}

export default function EstadisticasPage({ params }: EstadisticasPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const championship = getChampionshipById(id)

  if (!championship) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold">Campeonato no encontrado</h2>
          <Button className="mt-4" onClick={() => router.push("/")}>
            Volver al inicio
          </Button>
        </Card>
      </div>
    )
  }

  const teams = getTeamsByChampionship(id)
  const teamIds = teams.map((t) => t.id)
  const championshipPlayers = players.filter((p) => teamIds.includes(p.teamId))

  // Mock player stats (in a real app, this would come from a database)
  const playerStats = championshipPlayers.map((player) => ({
    ...player,
    points: Math.floor(Math.random() * 150) + 50,
    games: Math.floor(Math.random() * 5) + 2,
    assists: Math.floor(Math.random() * 30) + 5,
    rebounds: Math.floor(Math.random() * 40) + 10,
  }))

  const topScorers = [...playerStats].sort((a, b) => b.points - a.points).slice(0, 10)
  const topPPG = [...playerStats]
    .map((p) => ({ ...p, ppg: p.points / p.games }))
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, 10)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-xl tracking-tight">LaBaS</span>
                <p className="text-xs text-muted-foreground hidden sm:block">Liga Amateur de Basquet Salteño</p>
              </div>
            </Link>
          </div>
        </div>
      </header>

      {/* Page Header */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => router.push(`/campeonato/${id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a {championship.name}
          </Button>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Estadísticas</h1>
              <p className="text-primary-foreground/70">{championship.name}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="scorers" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
            <TabsTrigger value="scorers" className="gap-2">
              <Target className="h-4 w-4" />
              Goleadores
            </TabsTrigger>
            <TabsTrigger value="averages" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Promedios
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scorers">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Máximos Goleadores
                </CardTitle>
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topScorers.map((player, index) => {
                        const team = getTeamById(player.teamId)
                        return (
                          <TableRow key={player.id}>
                            <TableCell className="text-center">
                              {index === 0 ? (
                                <Badge className="bg-yellow-500 text-white">1</Badge>
                              ) : index === 1 ? (
                                <Badge className="bg-gray-400 text-white">2</Badge>
                              ) : index === 2 ? (
                                <Badge className="bg-amber-700 text-white">3</Badge>
                              ) : (
                                <span className="text-muted-foreground">{index + 1}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
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
                                <div
                                  className="h-4 w-4 rounded-full"
                                  style={{ backgroundColor: team?.primaryColor || "#6b7280" }}
                                />
                                <span className="text-sm">{team?.club}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{player.games}</TableCell>
                            <TableCell className="text-center font-bold text-lg">{player.points}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="averages">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Mejores Promedios (PPG)
                </CardTitle>
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
                        <TableHead className="text-center">PPG</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topPPG.map((player, index) => {
                        const team = getTeamById(player.teamId)
                        return (
                          <TableRow key={player.id}>
                            <TableCell className="text-center">
                              {index === 0 ? (
                                <Badge className="bg-yellow-500 text-white">1</Badge>
                              ) : index === 1 ? (
                                <Badge className="bg-gray-400 text-white">2</Badge>
                              ) : index === 2 ? (
                                <Badge className="bg-amber-700 text-white">3</Badge>
                              ) : (
                                <span className="text-muted-foreground">{index + 1}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
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
                                <div
                                  className="h-4 w-4 rounded-full"
                                  style={{ backgroundColor: team?.primaryColor || "#6b7280" }}
                                />
                                <span className="text-sm">{team?.club}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{player.games}</TableCell>
                            <TableCell className="text-center">{player.points}</TableCell>
                            <TableCell className="text-center font-bold text-lg text-primary">
                              {player.ppg.toFixed(1)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="font-semibold">LaBaS</span>
            </div>
            <p className="text-sm text-muted-foreground">Liga Amateur de Basquet Salteño</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
