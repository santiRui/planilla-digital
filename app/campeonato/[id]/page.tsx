"use client"

import { use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, Calendar, Trophy, BarChart3, Users, ArrowLeft, ChevronRight } from "lucide-react"
import {
  getChampionshipById,
  getTeamsByChampionship,
  getMatchesByChampionship,
  getStandingsByChampionship,
} from "@/lib/mock-data"

interface ChampionshipPageProps {
  params: Promise<{ id: string }>
}

export default function ChampionshipPage({ params }: ChampionshipPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const championship = getChampionshipById(id)

  if (!championship) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold">Campeonato no encontrado</h2>
          <p className="text-muted-foreground mt-2">El campeonato que buscas no existe.</p>
          <Button className="mt-4" onClick={() => router.push("/")}>
            Volver al inicio
          </Button>
        </Card>
      </div>
    )
  }

  const teams = getTeamsByChampionship(id)
  const matches = getMatchesByChampionship(id)
  const standings = getStandingsByChampionship(id)

  const finishedMatches = matches.filter((m) => m.status === "finalizado").length
  const liveMatches = matches.filter((m) => m.status === "en_juego").length
  const scheduledMatches = matches.filter((m) => m.status === "programado").length

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

  const menuItems = [
    {
      href: `/campeonato/${id}/fixture`,
      icon: Calendar,
      title: "Fixture",
      description: "Calendario de partidos y resultados",
      stats: `${finishedMatches} jugados, ${scheduledMatches} programados`,
      highlight: liveMatches > 0,
      highlightText: `${liveMatches} en vivo`,
    },
    {
      href: `/campeonato/${id}/posiciones`,
      icon: Trophy,
      title: "Tabla de Posiciones",
      description: "Clasificación general del campeonato",
      stats: `${teams.length} equipos`,
    },
    {
      href: `/campeonato/${id}/estadisticas`,
      icon: BarChart3,
      title: "Estadísticas",
      description: "Estadísticas de jugadores y equipos",
      stats: "Goleadores, promedios y más",
    },
    {
      href: `/campeonato/${id}/equipos`,
      icon: Users,
      title: "Equipos",
      description: "Lista de equipos y jugadores (Lista de Buena Fe)",
      stats: `${teams.length} equipos participantes`,
    },
  ]

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

      {/* Championship Header */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a campeonatos
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary-foreground/10 text-primary-foreground font-bold text-2xl">
              {championship.shortName}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold">{championship.name}</h1>
                <Badge variant="outline" className={`${branchColors[championship.branch]} border`}>
                  {branchLabels[championship.branch]}
                </Badge>
              </div>
              <p className="text-primary-foreground/70">
                {championship.description} - Temporada {championship.year}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
            <div className="bg-primary-foreground/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{teams.length}</div>
              <div className="text-sm text-primary-foreground/70">Equipos</div>
            </div>
            <div className="bg-primary-foreground/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{matches.length}</div>
              <div className="text-sm text-primary-foreground/70">Partidos</div>
            </div>
            <div className="bg-primary-foreground/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{finishedMatches}</div>
              <div className="text-sm text-primary-foreground/70">Jugados</div>
            </div>
            <div className="bg-primary-foreground/10 rounded-lg p-4 text-center">
              {liveMatches > 0 ? (
                <>
                  <div className="text-2xl font-bold text-green-400">{liveMatches}</div>
                  <div className="text-sm text-green-400/90 flex items-center justify-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
                    </span>
                    En vivo
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">{scheduledMatches}</div>
                  <div className="text-sm text-primary-foreground/70">Por jugar</div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Menu Options */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href} className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:border-primary group-hover:scale-[1.01]">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <item.icon className="h-6 w-6" />
                    </div>
                    {item.highlight && (
                      <Badge className="bg-green-500 text-white animate-pulse">{item.highlightText}</Badge>
                    )}
                  </div>
                  <CardTitle className="mt-4 flex items-center justify-between">
                    {item.title}
                    <ChevronRight className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100 text-primary" />
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.stats}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Leader Preview */}
        {standings.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold mb-4">Líder actual</h2>
            <Card className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/20">
                  <Trophy className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{teams.find((t) => t.id === standings[0].teamId)?.name || "Equipo"}</p>
                  <p className="text-sm text-muted-foreground">
                    {standings[0].won}G - {standings[0].lost}P | {standings[0].points} pts
                  </p>
                </div>
                <Badge variant="secondary" className="text-lg px-3">
                  1°
                </Badge>
              </CardContent>
            </Card>
          </div>
        )}
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
