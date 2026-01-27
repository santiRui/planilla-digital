"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Calendar, Users, ChevronRight, Shield, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { championships, getTeamsByChampionship } from "@/lib/mock-data"

export default function HomePage() {
  const activeChampionships = championships.filter((c) => c.status === "activo")
  const upcomingChampionships = championships.filter((c) => c.status === "pendiente")

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

            <Button variant="outline" size="sm" asChild>
              <Link href="/login">
                <Shield className="h-4 w-4 mr-2" />
                Administración
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-4 py-2 backdrop-blur-sm">
              <Activity className="h-5 w-5" />
              <span className="text-sm font-medium">Temporada 2024</span>
            </div>
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl text-balance">LaBaS</h1>
            <p className="mx-auto mt-4 max-w-xl text-xl text-primary-foreground/90 text-pretty">
              Liga Amateur de Basquet Salteño
            </p>
            <p className="mx-auto mt-6 max-w-2xl text-primary-foreground/70 text-pretty">
              Selecciona un campeonato para ver el fixture, tabla de posiciones, estadísticas de jugadores y equipos
              participantes con sus listas de buena fe.
            </p>
          </div>
        </div>
      </section>

      {/* Championships List */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-10 sm:px-6 lg:px-8">
        {/* Active Championships */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
              <Trophy className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Campeonatos en Curso</h2>
              <p className="text-muted-foreground text-sm">Selecciona un campeonato para ver toda su información</p>
            </div>
          </div>

          {activeChampionships.length === 0 ? (
            <Card className="p-12 text-center">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No hay campeonatos activos</h3>
              <p className="text-muted-foreground mt-1">Los campeonatos aparecerán aquí cuando comiencen.</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeChampionships.map((championship) => {
                const teams = getTeamsByChampionship(championship.id)

                const branchColors = {
                  masculino: "bg-blue-500/10 text-blue-600 border-blue-500/20",
                  femenino: "bg-pink-500/10 text-pink-600 border-pink-500/20",
                  mixto: "bg-purple-500/10 text-purple-600 border-purple-500/20",
                }

                const branchLabels = {
                  masculino: "Masculino",
                  femenino: "Femenino",
                  mixto: "Mixto",
                }

                return (
                  <Link key={championship.id} href={`/campeonato/${championship.id}`} className="group">
                    <Card className="h-full transition-all hover:shadow-lg hover:border-primary group-hover:scale-[1.02]">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-lg">
                            {championship.shortName}
                          </div>
                          <Badge variant="outline" className={branchColors[championship.branch]}>
                            {branchLabels[championship.branch]}
                          </Badge>
                        </div>
                        <CardTitle className="mt-4 flex items-center justify-between">
                          {championship.name}
                          <ChevronRight className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100 text-primary" />
                        </CardTitle>
                        <CardDescription className="line-clamp-2">
                          {championship.description || "Campeonato de básquetbol"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" />
                            <span>{championship.year}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Users className="h-4 w-4" />
                            <span>{teams.length} equipos</span>
                          </div>
                          {championship.ageGroup && (
                            <Badge variant="secondary" className="text-xs">
                              {championship.ageGroup}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Upcoming Championships */}
        {upcomingChampionships.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/10">
                <Calendar className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Próximos Campeonatos</h2>
                <p className="text-muted-foreground text-sm">Campeonatos que iniciarán próximamente</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingChampionships.map((championship) => (
                <Card key={championship.id} className="h-full opacity-75">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground font-bold text-lg">
                        {championship.shortName}
                      </div>
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                        Próximamente
                      </Badge>
                    </div>
                    <CardTitle className="mt-4">{championship.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {championship.description || "Campeonato de básquetbol"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        <span>{championship.year}</span>
                      </div>
                      {championship.ageGroup && (
                        <Badge variant="secondary" className="text-xs">
                          {championship.ageGroup}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="font-semibold">LaBaS</span>
            </div>
            <p className="text-sm text-muted-foreground">Liga Amateur de Basquet Salteño - Temporada 2024</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
