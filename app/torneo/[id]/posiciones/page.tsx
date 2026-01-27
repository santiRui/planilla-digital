"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trophy, ArrowLeft } from "lucide-react"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export default function TournamentStandingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { tournaments, categories, teams, standings } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  const tournament = tournaments.find((t) => t.id === id)
  const tournamentCategories = categories.filter((c) => c.tournamentId === id)

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

  const filteredCategories =
    selectedCategory === "all" ? tournamentCategories : tournamentCategories.filter((c) => c.id === selectedCategory)

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
            <Trophy className="h-6 w-6" />
            <h1 className="text-2xl font-bold sm:text-3xl">Posiciones</h1>
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
                {tournamentCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Standings */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        {filteredCategories.length === 0 ? (
          <Card className="p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No hay categorías disponibles</h3>
          </Card>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map((category) => {
              const categoryStandings = standings
                .filter((s) => s.categoryId === category.id)
                .sort((a, b) => {
                  if (b.points !== a.points) return b.points - a.points
                  const aDiff = a.pointsFor - a.pointsAgainst
                  const bDiff = b.pointsFor - b.pointsAgainst
                  return bDiff - aDiff
                })

              return (
                <Card key={category.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-primary" />
                      {category.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {categoryStandings.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">No hay datos de posiciones disponibles</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12 text-center">#</TableHead>
                              <TableHead>Equipo</TableHead>
                              <TableHead className="text-center">PJ</TableHead>
                              <TableHead className="text-center">PG</TableHead>
                              <TableHead className="text-center">PP</TableHead>
                              <TableHead className="text-center">PF</TableHead>
                              <TableHead className="text-center">PC</TableHead>
                              <TableHead className="text-center">DIF</TableHead>
                              <TableHead className="text-center font-bold">PTS</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {categoryStandings.map((standing, index) => {
                              const team = getTeamById(standing.teamId)
                              const diff = standing.pointsFor - standing.pointsAgainst
                              const isPlayoffPosition = index < (category.teamsToPlayoff || 4)

                              return (
                                <TableRow key={standing.teamId} className={cn(isPlayoffPosition && "bg-green-500/5")}>
                                  <TableCell className="text-center">
                                    <div
                                      className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mx-auto",
                                        index === 0 && "bg-yellow-500 text-yellow-950",
                                        index === 1 && "bg-gray-300 text-gray-700",
                                        index === 2 && "bg-amber-600 text-amber-950",
                                        index > 2 && "bg-muted text-muted-foreground",
                                      )}
                                    >
                                      {index + 1}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      <div
                                        className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                                        style={{ backgroundColor: team?.primaryColor || "#6366f1" }}
                                      >
                                        {team?.name.substring(0, 2).toUpperCase()}
                                      </div>
                                      <div>
                                        <p className="font-medium">{team?.name}</p>
                                        <p className="text-xs text-muted-foreground">{team?.clubName}</p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">{standing.played}</TableCell>
                                  <TableCell className="text-center text-green-600 font-medium">
                                    {standing.won}
                                  </TableCell>
                                  <TableCell className="text-center text-red-600 font-medium">
                                    {standing.lost}
                                  </TableCell>
                                  <TableCell className="text-center">{standing.pointsFor}</TableCell>
                                  <TableCell className="text-center">{standing.pointsAgainst}</TableCell>
                                  <TableCell
                                    className={cn(
                                      "text-center font-medium",
                                      diff > 0 && "text-green-600",
                                      diff < 0 && "text-red-600",
                                    )}
                                  >
                                    {diff > 0 ? `+${diff}` : diff}
                                  </TableCell>
                                  <TableCell className="text-center font-bold text-lg">{standing.points}</TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/40" />
                      <span>Clasificados a playoffs</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
