"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAppStore } from "@/lib/store"
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react"

export default function PosicionesPage() {
  const { standings, teams, categories } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id || "")

  const categoryStandings = standings
    .filter((s) => s.categoryId === selectedCategory)
    .sort((a, b) => {
      // Sort by points first, then by point difference
      if (b.points !== a.points) return b.points - a.points
      const aDiff = a.pointsFor - a.pointsAgainst
      const bDiff = b.pointsFor - b.pointsAgainst
      return bDiff - aDiff
    })

  const getTeam = (id: string) => teams.find((t) => t.id === id)

  const getPositionIcon = (position: number) => {
    if (position === 1) return <Trophy className="h-5 w-5 text-[var(--color-warning)]" />
    if (position <= 4) return <TrendingUp className="h-4 w-4 text-[var(--color-success)]" />
    if (position > categoryStandings.length - 2) return <TrendingDown className="h-4 w-4 text-destructive" />
    return <Minus className="h-4 w-4 text-muted-foreground" />
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Tabla de Posiciones</h1>
          <p className="text-muted-foreground mt-1">Clasificación actual del torneo</p>
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

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-lg">
            {categories.find((c) => c.id === selectedCategory)?.name || "Categoría"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead className="text-center w-12">PJ</TableHead>
                  <TableHead className="text-center w-12">G</TableHead>
                  <TableHead className="text-center w-12">P</TableHead>
                  <TableHead className="text-center w-16">PF</TableHead>
                  <TableHead className="text-center w-16">PC</TableHead>
                  <TableHead className="text-center w-16">DIF</TableHead>
                  <TableHead className="text-center w-16 font-bold">PTS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryStandings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No hay datos de clasificación disponibles
                    </TableCell>
                  </TableRow>
                ) : (
                  categoryStandings.map((standing, index) => {
                    const team = getTeam(standing.teamId)
                    const diff = standing.pointsFor - standing.pointsAgainst
                    const position = index + 1

                    return (
                      <TableRow key={standing.teamId} className={position <= 4 ? "bg-[var(--color-success)]/5" : ""}>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getPositionIcon(position)}
                            <span className="font-semibold">{position}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ backgroundColor: team?.primaryColor || "#666" }}
                            >
                              {team?.name.substring(0, 2).toUpperCase() || "??"}
                            </div>
                            <div>
                              <p className="font-medium">{team?.name || "Desconocido"}</p>
                              <p className="text-xs text-muted-foreground hidden sm:block">{team?.neighborhood}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{standing.played}</TableCell>
                        <TableCell className="text-center text-[var(--color-success)]">{standing.won}</TableCell>
                        <TableCell className="text-center text-destructive">{standing.lost}</TableCell>
                        <TableCell className="text-center">{standing.pointsFor}</TableCell>
                        <TableCell className="text-center">{standing.pointsAgainst}</TableCell>
                        <TableCell
                          className={`text-center font-medium ${diff > 0 ? "text-[var(--color-success)]" : diff < 0 ? "text-destructive" : ""}`}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-bold text-lg">{standing.points}</span>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[var(--color-success)]" />
          <span>Clasificación</span>
        </div>
        <span className="text-xs">
          PJ: Partidos Jugados | G: Ganados | P: Perdidos | PF: Puntos a Favor | PC: Puntos en Contra | DIF: Diferencia
          | PTS: Puntos
        </span>
      </div>
    </div>
  )
}
