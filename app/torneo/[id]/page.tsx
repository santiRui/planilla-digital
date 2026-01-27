"use client"

import { use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trophy, Calendar, BarChart3, Users, ArrowLeft, MapPin, ChevronRight } from "lucide-react"
import { useAppStore } from "@/lib/store"

export default function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { tournaments, categories, teams, matches } = useAppStore()

  const tournament = tournaments.find((t) => t.id === id)
  const tournamentCategories = categories.filter((c) => c.tournamentId === id)
  const tournamentTeams = teams.filter((t) => tournamentCategories.some((c) => c.id === t.categoryId))
  const tournamentMatches = matches.filter((m) => tournamentCategories.some((c) => c.id === m.categoryId))

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 text-center max-w-md">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold">Torneo no encontrado</h2>
          <p className="text-muted-foreground mt-2 mb-4">El torneo que buscas no existe o fue eliminado.</p>
          <Button onClick={() => router.push("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al inicio
          </Button>
        </Card>
      </div>
    )
  }

  const statusColors = {
    planificacion: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    en_curso: "bg-green-500/10 text-green-600 border-green-500/20",
    finalizado: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  }

  const statusLabels = {
    planificacion: "Planificación",
    en_curso: "En Curso",
    finalizado: "Finalizado",
  }

  const menuOptions = [
    {
      href: `/torneo/${id}/fixture`,
      label: "Fixture",
      description: "Calendario de partidos y resultados",
      icon: Calendar,
      color: "bg-primary/10 text-primary",
      stats: `${tournamentMatches.length} partidos`,
    },
    {
      href: `/torneo/${id}/posiciones`,
      label: "Posiciones",
      description: "Tabla de posiciones por categoría",
      icon: Trophy,
      color: "bg-accent/10 text-accent",
      stats: `${tournamentCategories.length} categorías`,
    },
    {
      href: `/torneo/${id}/estadisticas`,
      label: "Estadísticas",
      description: "Estadísticas de jugadores y equipos",
      icon: BarChart3,
      color: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
      stats: "Goleadores, promedios",
    },
    {
      href: `/torneo/${id}/equipos`,
      label: "Equipos",
      description: "Lista de equipos y jugadores (Lista de Buena Fe)",
      icon: Users,
      color: "bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
      stats: `${tournamentTeams.length} equipos`,
    },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
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
        </div>
      </header>

      {/* Tournament Hero */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Badge
                variant="outline"
                className="mb-3 bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
              >
                {statusLabels[tournament.status]}
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tournament.name}</h1>
              {tournament.description && (
                <p className="mt-2 text-primary-foreground/80 max-w-2xl">{tournament.description}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-4 text-sm text-primary-foreground/70">
                {tournament.startDate && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {new Date(tournament.startDate).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      {tournament.endDate &&
                        ` - ${new Date(tournament.endDate).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  <span>{tournamentTeams.length} equipos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  <span>{tournamentCategories.length} categorías</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Menu Options */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2">
          {menuOptions.map((option) => (
            <Link key={option.href} href={option.href} className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:border-primary group-hover:scale-[1.02]">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${option.color}`}>
                      <option.icon className="h-7 w-7" />
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <CardTitle className="text-xl mt-4">{option.label}</CardTitle>
                  <CardDescription>{option.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium text-muted-foreground">{option.stats}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Trophy className="h-4 w-4 text-primary" />
            <span>GETOBA - Gestión de Torneos de Basquet</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
