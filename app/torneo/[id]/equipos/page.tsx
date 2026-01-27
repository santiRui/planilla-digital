"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trophy, ArrowLeft, Users, User, ChevronRight, Phone } from "lucide-react"
import { useAppStore } from "@/lib/store"

export default function TournamentTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { tournaments, teams, players, coachingStaff } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)

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

  const filteredTeams = tournamentTeams

  const team = selectedTeam ? teams.find((t) => t.id === selectedTeam) : null
  const teamPlayers = selectedTeam ? players.filter((p) => p.teamId === selectedTeam) : []
  const teamStaff = selectedTeam ? coachingStaff.filter((c) => c.teamId === selectedTeam) : []

  const roleLabels: Record<string, string> = {
    head_coach: "Director Técnico",
    assistant: "Asistente",
    manager: "Delegado",
    medic: "Médico",
    other: "Otro",
  }

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
            <Users className="h-6 w-6" />
            <h1 className="text-2xl font-bold sm:text-3xl">Equipos</h1>
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

      {/* Teams Grid */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        {filteredTeams.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No hay equipos disponibles</h3>
            <p className="text-muted-foreground mt-1">No se encontraron equipos para esta categoría.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTeams.map((team) => {
              const teamPlayerCount = players.filter((p) => p.teamId === team.id).length

              return (
                <Card
                  key={team.id}
                  className="cursor-pointer transition-all hover:shadow-lg hover:border-primary"
                  onClick={() => setSelectedTeam(team.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-4">
                      <div
                        className="h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: team.primaryColor || "#6366f1" }}
                      >
                        {team.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <CardTitle className="flex items-center justify-between">
                          {team.name}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">{team.club}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <Badge variant="outline">{tournament.name}</Badge>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>{teamPlayerCount} jugadores</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      {/* Team Detail Dialog (Lista de Buena Fe) */}
      <Dialog open={!!selectedTeam} onOpenChange={() => setSelectedTeam(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {team && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <div
                    className="h-16 w-16 rounded-full flex items-center justify-center text-white font-bold text-xl"
                    style={{ backgroundColor: team.primaryColor || "#6366f1" }}
                  >
                    {team.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <DialogTitle className="text-2xl">{team.name}</DialogTitle>
                    <p className="text-muted-foreground">{team.club}</p>
                    <Badge variant="outline" className="mt-1">
                      {tournament.name}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Lista de Buena Fe - Players */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Lista de Buena Fe - Jugadores ({teamPlayers.length})
                  </h3>

                  {teamPlayers.length === 0 ? (
                    <p className="text-muted-foreground text-center py-6">No hay jugadores registrados</p>
                  ) : (
                    <div className="overflow-x-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16 text-center">#</TableHead>
                            <TableHead>Nombre</TableHead>
                            <TableHead className="text-center">Edad</TableHead>
                            <TableHead className="text-center">Altura</TableHead>
                            <TableHead>DNI</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {teamPlayers
                            .sort((a, b) => a.jerseyNumber - b.jerseyNumber)
                            .map((player) => {
                              const age = player.birthDate
                                ? Math.floor(
                                    (Date.now() - new Date(player.birthDate).getTime()) /
                                      (365.25 * 24 * 60 * 60 * 1000),
                                  )
                                : null

                              return (
                                <TableRow key={player.id}>
                                  <TableCell className="text-center">
                                    <div
                                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm mx-auto"
                                      style={{ backgroundColor: team.primaryColor || "#6366f1" }}
                                    >
                                      {player.jerseyNumber}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">
                                        {player.lastName}, {player.firstName}
                                      </p>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">{age ? `${age} años` : "-"}</TableCell>
                                  <TableCell className="text-center">
                                    {player.height ? `${player.height} cm` : "-"}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {player.dni || "-"}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Coaching Staff */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-accent" />
                    Cuerpo Técnico ({teamStaff.length})
                  </h3>

                  {teamStaff.length === 0 ? (
                    <p className="text-muted-foreground text-center py-6">No hay cuerpo técnico registrado</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {teamStaff.map((staff) => (
                        <Card key={staff.id} className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {staff.firstName} {staff.lastName}
                              </p>
                              <Badge variant="secondary" className="text-xs">
                                {roleLabels[staff.role] || staff.role}
                              </Badge>
                            </div>
                          </div>
                          {staff.phone && (
                            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                              <Phone className="h-4 w-4" />
                              <span>{staff.phone}</span>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
