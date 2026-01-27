"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { useAppStore } from "@/lib/store"
import { Trophy, Users, Calendar, UserCircle, TrendingUp, Clock } from "lucide-react"
import { BadgeStatus } from "@/components/ui/badge-status"
import Link from "next/link"

export default function AdminDashboard() {
  const { tournaments, categories, teams, players, matches } = useAppStore()

  const activeTournaments = tournaments.filter((t) => t.status === "activo").length
  const totalMatches = matches.length
  const matchesInProgress = matches.filter((m) => m.status === "en_juego").length
  const upcomingMatches = matches.filter((m) => m.status === "programado").slice(0, 5)

  const stats = [
    { name: "Torneos Activos", value: activeTournaments, icon: Trophy, color: "text-primary" },
    { name: "Categorías", value: categories.length, icon: TrendingUp, color: "text-accent" },
    { name: "Equipos", value: teams.length, icon: Users, color: "text-[var(--color-success)]" },
    { name: "Jugadores", value: players.length, icon: UserCircle, color: "text-[var(--color-warning)]" },
    { name: "Partidos Totales", value: totalMatches, icon: Calendar, color: "text-secondary-foreground" },
    { name: "En Juego Ahora", value: matchesInProgress, icon: Clock, color: "text-[var(--color-live)]" },
  ]

  // Get team names helper
  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "TBD"

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración" }]} />

      <div>
        <h1 className="text-3xl font-bold">Panel de Administración</h1>
        <p className="text-muted-foreground mt-1">Gestiona todos los aspectos del torneo desde aquí.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-lg bg-muted p-3 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.name}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Upcoming Matches */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
            <CardDescription>Accede a las funciones más utilizadas</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Link
              href="/admin/torneos"
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted transition-colors"
            >
              <Trophy className="h-5 w-5 text-primary" />
              <span className="font-medium">Gestionar Torneos</span>
            </Link>
            <Link
              href="/admin/equipos"
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted transition-colors"
            >
              <Users className="h-5 w-5 text-primary" />
              <span className="font-medium">Gestionar Equipos</span>
            </Link>
            <Link
              href="/admin/fixture"
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted transition-colors"
            >
              <Calendar className="h-5 w-5 text-primary" />
              <span className="font-medium">Ver Fixture</span>
            </Link>
            <Link
              href="/admin/programacion"
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted transition-colors"
            >
              <Clock className="h-5 w-5 text-primary" />
              <span className="font-medium">Programar Partidos</span>
            </Link>
          </CardContent>
        </Card>

        {/* Upcoming Matches */}
        <Card>
          <CardHeader>
            <CardTitle>Próximos Partidos</CardTitle>
            <CardDescription>Partidos programados pendientes</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingMatches.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No hay partidos programados</p>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map((match) => (
                  <div key={match.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Fecha {match.round}
                        {match.scheduledDate && ` • ${new Date(match.scheduledDate).toLocaleDateString("es-AR")}`}
                        {match.scheduledTime && ` ${match.scheduledTime}`}
                      </p>
                    </div>
                    <BadgeStatus status={match.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
