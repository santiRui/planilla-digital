"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAppStore } from "@/lib/store"
import { Users, MapPin, UserCircle, Phone, Mail } from "lucide-react"
import type { Team } from "@/lib/types"

export default function EquiposPage() {
  const { teams, players, categories, coachingStaff, standings } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id || "")
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  const categoryTeams = teams.filter((t) => t.championshipId === selectedCategory)

  const getPlayerCount = (teamId: string) => players.filter((p) => p.teamId === teamId && p.isFederated).length
  const getCoaches = (teamId: string) => coachingStaff.filter((c) => c.teamId === teamId)
  const getPlayers = (teamId: string) =>
    players.filter((p) => p.teamId === teamId).sort((a, b) => a.jerseyNumber - b.jerseyNumber)
  const getTeamStanding = (teamId: string) =>
    standings.find((s) => s.teamId === teamId && s.categoryId === selectedCategory)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Equipos</h1>
          <p className="text-muted-foreground mt-1">Planteles y staff técnico de cada equipo</p>
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

      {categoryTeams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No hay equipos</p>
            <p className="text-sm text-muted-foreground">No hay equipos registrados en esta categoría.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categoryTeams.map((team) => {
            const standing = getTeamStanding(team.id)
            const coaches = getCoaches(team.id)
            const headCoach = coaches.find((c) => c.role === "tecnico")

            return (
              <Card
                key={team.id}
                className="cursor-pointer transition-all hover:shadow-lg hover:border-primary overflow-hidden"
                onClick={() => setSelectedTeam(team)}
              >
                <div className="h-2" style={{ backgroundColor: team.primaryColor }} />
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-16 w-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
                      style={{ backgroundColor: team.primaryColor }}
                    >
                      {team.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{team.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {team.club}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Stats */}
                    {standing && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Récord</span>
                        <span className="font-medium">
                          <span className="text-[var(--color-success)]">{standing.won}G</span>
                          {" - "}
                          <span className="text-destructive">{standing.lost}P</span>
                        </span>
                      </div>
                    )}

                    {/* Players */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Jugadores</span>
                      <div className="flex items-center gap-1">
                        <UserCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{getPlayerCount(team.id)}</span>
                      </div>
                    </div>

                    {/* Coach */}
                    {headCoach && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">DT</span>
                        <span className="font-medium">
                          {headCoach.firstName} {headCoach.lastName}
                        </span>
                      </div>
                    )}

                    {/* Colors */}
                    <div className="flex items-center gap-2 pt-2">
                      <div
                        className="h-4 w-4 rounded-full border"
                        style={{ backgroundColor: team.primaryColor }}
                        title="Color principal"
                      />
                      <div
                        className="h-4 w-4 rounded-full border"
                        style={{ backgroundColor: team.secondaryColor }}
                        title="Color secundario"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Team Detail Dialog */}
      <Dialog open={!!selectedTeam} onOpenChange={() => setSelectedTeam(null)}>
        {selectedTeam && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-4">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center text-white text-lg font-bold"
                  style={{ backgroundColor: selectedTeam.primaryColor }}
                >
                  {selectedTeam.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <DialogTitle className="text-2xl">{selectedTeam.name}</DialogTitle>
                  <DialogDescription className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {selectedTeam.club}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Coaching Staff */}
            {getCoaches(selectedTeam.id).length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">Cuerpo Técnico</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {getCoaches(selectedTeam.id).map((coach) => (
                    <Card key={coach.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <UserCircle className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {coach.firstName} {coach.lastName}
                            </p>
                            <Badge variant="secondary" className="text-xs">
                              {coach.role === "tecnico" ? "Director Técnico" : "Asistente"}
                            </Badge>
                          </div>
                        </div>
                        {(coach.phone || coach.email) && (
                          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                            {coach.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3 w-3" />
                                {coach.phone}
                              </div>
                            )}
                            {coach.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-3 w-3" />
                                {coach.email}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Roster */}
            <div className="space-y-3">
              <h3 className="font-semibold">Plantel ({getPlayers(selectedTeam.id).length} jugadores)</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-center">Federado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getPlayers(selectedTeam.id).map((player) => (
                      <TableRow key={player.id}>
                        <TableCell>
                          <span
                            className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                            style={{ backgroundColor: selectedTeam.primaryColor }}
                          >
                            {player.jerseyNumber}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {player.firstName} {player.lastName}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={player.isFederated ? "default" : "secondary"}>
                            {player.isFederated ? "Federado" : "No federado"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
