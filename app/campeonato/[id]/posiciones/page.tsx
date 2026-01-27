"use client"

import { use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, ArrowLeft, Trophy } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getChampionshipById, getTeamById, getStandingsByChampionship } from "@/lib/mock-data"

interface PosicionesPageProps {
  params: Promise<{ id: string }>
}

export default function PosicionesPage({ params }: PosicionesPageProps) {
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

  const standings = getStandingsByChampionship(id)

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
            <Trophy className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Tabla de Posiciones</h1>
              <p className="text-primary-foreground/70">{championship.name}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Standings Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        {standings.length === 0 ? (
          <Card className="p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No hay posiciones disponibles</h3>
            <p className="text-muted-foreground mt-1">Las posiciones aparecerán cuando se registren partidos.</p>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Clasificación General</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Equipo</TableHead>
                      <TableHead className="text-center w-14">PJ</TableHead>
                      <TableHead className="text-center w-14">G</TableHead>
                      <TableHead className="text-center w-14">P</TableHead>
                      <TableHead className="text-center w-16">PF</TableHead>
                      <TableHead className="text-center w-16">PC</TableHead>
                      <TableHead className="text-center w-16">DIF</TableHead>
                      <TableHead className="text-center w-14">PTS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {standings.map((standing, index) => {
                      const team = getTeamById(standing.teamId)
                      const diff = standing.pointsFor - standing.pointsAgainst
                      const isPlayoffPosition = index < 4

                      return (
                        <TableRow key={standing.teamId} className={isPlayoffPosition ? "bg-green-500/5" : ""}>
                          <TableCell className="text-center font-bold">
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
                              <div
                                className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                                style={{ backgroundColor: team?.primaryColor || "#6b7280" }}
                              >
                                {team?.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium">{team?.name || "Equipo"}</p>
                                <p className="text-xs text-muted-foreground">{team?.club}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{standing.played}</TableCell>
                          <TableCell className="text-center text-green-600 font-medium">{standing.won}</TableCell>
                          <TableCell className="text-center text-red-600 font-medium">{standing.lost}</TableCell>
                          <TableCell className="text-center">{standing.pointsFor}</TableCell>
                          <TableCell className="text-center">{standing.pointsAgainst}</TableCell>
                          <TableCell
                            className={`text-center font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : ""}`}
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
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-500/20 border border-green-500/30"></div>
            <span>Zona de Playoffs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">PJ</span> Partidos Jugados
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">G</span> Ganados
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">P</span> Perdidos
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">PF</span> Puntos a Favor
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">PC</span> Puntos en Contra
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">DIF</span> Diferencia
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">PTS</span> Puntos
          </div>
        </div>
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
