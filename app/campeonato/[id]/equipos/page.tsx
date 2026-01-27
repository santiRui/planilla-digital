"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Activity, ArrowLeft, Users, User, Clipboard, Phone, Mail } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getChampionshipById, getTeamsByChampionship, getPlayersByTeam, getCoachingStaffByTeam } from "@/lib/mock-data"
import type { Team } from "@/lib/types"

interface EquiposPageProps {
  params: Promise<{ id: string }>
}

export default function EquiposPage({ params }: EquiposPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const championship = getChampionshipById(id)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

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

  const roleLabels: Record<string, string> = {
    tecnico: "Director Técnico",
    asistente: "Asistente Técnico",
    delegado: "Delegado",
  }

  const calculateAge = (birthDate: Date) => {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

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
            <Users className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Equipos Participantes</h1>
              <p className="text-primary-foreground/70">{championship.name}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Teams Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        {teams.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No hay equipos registrados</h3>
            <p className="text-muted-foreground mt-1">Los equipos aparecerán aquí cuando se inscriban al campeonato.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => {
              const teamPlayers = getPlayersByTeam(team.id)
              const federatedPlayers = teamPlayers.filter((p) => p.isFederated)

              return (
                <Card
                  key={team.id}
                  className="cursor-pointer transition-all hover:shadow-lg hover:border-primary hover:scale-[1.02]"
                  onClick={() => setSelectedTeam(team)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-4">
                      <div
                        className="h-14 w-14 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: team.primaryColor }}
                      >
                        {team.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{team.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{team.club}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>{federatedPlayers.length} jugadores</span>
                      </div>
                      <Button variant="outline" size="sm">
                        <Clipboard className="h-4 w-4 mr-2" />
                        Ver Lista
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      {/* Team Detail Dialog */}
      <Dialog open={!!selectedTeam} onOpenChange={() => setSelectedTeam(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedTeam && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <div
                    className="h-16 w-16 rounded-lg flex items-center justify-center text-white font-bold text-xl"
                    style={{ backgroundColor: selectedTeam.primaryColor }}
                  >
                    {selectedTeam.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <DialogTitle className="text-2xl">{selectedTeam.name}</DialogTitle>
                    <p className="text-muted-foreground">{selectedTeam.club}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Lista de Buena Fe */}
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Clipboard className="h-5 w-5 text-primary" />
                    Lista de Buena Fe
                  </h3>
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16 text-center">#</TableHead>
                          <TableHead>Jugador</TableHead>
                          <TableHead className="text-center">Edad</TableHead>
                          <TableHead className="text-center">Altura</TableHead>
                          <TableHead>DNI</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getPlayersByTeam(selectedTeam.id)
                          .filter((p) => p.isFederated)
                          .sort((a, b) => a.jerseyNumber - b.jerseyNumber)
                          .map((player) => (
                            <TableRow key={player.id}>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="font-bold">
                                  {player.jerseyNumber}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {player.lastName}, {player.firstName}
                              </TableCell>
                              <TableCell className="text-center">{calculateAge(player.birthDate)} años</TableCell>
                              <TableCell className="text-center">
                                {player.height ? `${player.height} cm` : "-"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{player.dni}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </Card>
                </div>

                {/* Cuerpo Técnico */}
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Users className="h-5 w-5 text-primary" />
                    Cuerpo Técnico
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {getCoachingStaffByTeam(selectedTeam.id).map((staff) => (
                      <Card key={staff.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">
                              {staff.firstName} {staff.lastName}
                            </p>
                            <Badge variant="outline" className="mt-1">
                              {roleLabels[staff.role]}
                            </Badge>
                            {staff.phone && (
                              <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                <span>{staff.phone}</span>
                              </div>
                            )}
                            {staff.email && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{staff.email}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
