m"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trophy, ArrowLeft, Calendar, Clock, MapPin, ChevronDown, ChevronUp } from "lucide-react"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export default function TournamentFixturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { tournaments, categories, teams, matches, venues, courts } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set([1, 2]))

  const tournament = tournaments.find((t) => t.id === id)
  // Tipado defensivo: algunas definiciones de categoría pueden no exponer tournamentId en TS
  const tournamentCategories = (categories as any[]).filter((c: any) => c.tournamentId === id)

  const filteredMatches = matches.filter((m) => {
    const matchCategory = tournamentCategories.find((c) => c.id === m.categoryId)
    if (!matchCategory) return false
    if (selectedCategory !== "all" && m.categoryId !== selectedCategory) return false
    return true
  })

  const matchesByRound = filteredMatches.reduce(
    (acc, match) => {
      const round = match.round || 1
      if (!acc[round]) acc[round] = []
      acc[round].push(match)
      return acc
    },
    {} as Record<number, typeof matches>,
  )

  const getByeTeamsForRound = (round: number) => {
    const categoriesToCheck =
      selectedCategory === "all" ? tournamentCategories : tournamentCategories.filter((c) => c.id === selectedCategory)

    const byes: Array<{ categoryId: string; teamId: string }> = []

    for (const category of categoriesToCheck) {
      const categoryMatches = filteredMatches.filter((m) => m.categoryId === category.id)
      const categoryTeamIds = Array.from(
        new Set(categoryMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean) as string[]),
      )

      if (categoryTeamIds.length % 2 === 0) continue

      const roundMatches = (matchesByRound[round] ?? []).filter((m) => m.categoryId === category.id)
      const used = new Set<string>()
      for (const match of roundMatches) {
        used.add(match.homeTeamId)
        used.add(match.awayTeamId)
      }

      const byeTeamId = categoryTeamIds.find((id) => !used.has(id))
      if (byeTeamId) byes.push({ categoryId: category.id, teamId: byeTeamId })
    }

    return byes
  }

  const toggleRound = (round: number) => {
    const newExpanded = new Set(expandedRounds)
    if (newExpanded.has(round)) {
      newExpanded.delete(round)
    } else {
      newExpanded.add(round)
    }
    setExpandedRounds(newExpanded)
  }

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
  const getVenueById = (venueId: string) => venues.find((v) => v.id === venueId)
  const getCourtById = (courtId: string) => courts.find((c) => c.id === courtId)

  const statusStyles: Record<string, string> = {
    programado: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    en_curso: "bg-[var(--color-live)]/10 text-[var(--color-live)] border-[var(--color-live)]/20",
    finalizado: "bg-gray-500/10 text-gray-600 border-gray-500/20",
    suspendido: "bg-red-500/10 text-red-600 border-red-500/20",
  }

  const statusLabels: Record<string, string> = {
    programado: "Programado",
    en_curso: "En Curso",
    finalizado: "Finalizado",
    suspendido: "Suspendido",
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
            <Calendar className="h-6 w-6" />
            <h1 className="text-2xl font-bold sm:text-3xl">Fixture</h1>
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

      {/* Fixture Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        {Object.keys(matchesByRound).length === 0 ? (
          <Card className="p-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No hay partidos programados</h3>
            <p className="text-muted-foreground mt-1">El fixture aún no ha sido generado para este torneo.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(matchesByRound)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([round, roundMatches]) => {
                const byeTeams = getByeTeamsForRound(Number(round))
                const byeCount = byeTeams.length

                return (
                  <Card key={round} className="overflow-hidden">
                    <button
                      onClick={() => toggleRound(Number(round))}
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                          {round}
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold">Fecha {round}</h3>
                          <p className="text-sm text-muted-foreground">
                            {roundMatches.length} partidos
                            {byeCount > 0 ? ` · ${byeCount} libre${byeCount === 1 ? "" : "s"}` : ""}
                          </p>
                        </div>
                      </div>
                      {expandedRounds.has(Number(round)) ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>

                    {expandedRounds.has(Number(round)) && (
                      <div className="border-t divide-y">
                        {(() => {
                          if (byeTeams.length === 0) return null
                          return (
                            <div className="p-4 bg-muted/30">
                              <p className="text-sm font-medium">Libre</p>
                              <div className="mt-1 space-y-1">
                                {byeTeams.map((b) => {
                                  const team = getTeamById(b.teamId)
                                  const category = tournamentCategories.find((c) => c.id === b.categoryId)
                                  return (
                                    <p key={`${b.categoryId}-${b.teamId}`} className="text-sm text-muted-foreground">
                                      {team?.name || "Por definir"}
                                      {selectedCategory === "all" && category ? ` · ${category.name}` : ""}
                                    </p>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}
                        {roundMatches.map((match) => {
                          const homeTeam = getTeamById(match.homeTeamId)
                          const awayTeam = getTeamById(match.awayTeamId)
                          const venue = match.venueId ? getVenueById(match.venueId) : null
                          const court = match.courtId ? getCourtById(match.courtId) : null
                          const category = tournamentCategories.find((c) => c.id === match.categoryId)

                          return (
                            <div key={match.id} className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <Badge variant="outline" className="text-xs">
                                  {category?.name}
                                </Badge>
                                <Badge variant="outline" className={cn("text-xs", statusStyles[match.status])}>
                                  {statusLabels[match.status as keyof typeof statusLabels]}
                                </Badge>
                              </div>

                              <div className="flex items-center justify-center gap-4 py-2">
                                {/* Home Team */}
                                <div className="flex-1 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <div>
                                      <p className="font-semibold">{homeTeam?.name || "Por definir"}</p>
                                      <p className="text-xs text-muted-foreground">{(homeTeam as any)?.clubName}</p>
                                    </div>
                                    <div
                                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                      style={{ backgroundColor: homeTeam?.primaryColor || "#6366f1" }}
                                    >
                                      {homeTeam?.name.substring(0, 2).toUpperCase() || "??"}
                                    </div>
                                  </div>
                                </div>

                                {/* Score: al hacer clic abre la vista pública del partido (historial + estadísticas) */}
                                <div className="px-4 text-center min-w-[80px]">
                                  <Link
                                    href={`/campeonato/${id}/partido/${match.id}`}
                                    className="inline-flex items-center justify-center gap-2 hover:underline underline-offset-4"
                                  >
                                    {match.status === "finalizado" || match.status === "en_juego" ? (
                                      <>
                                        <span className="text-2xl font-bold">{match.homeScore ?? 0}</span>
                                        <span className="text-muted-foreground">-</span>
                                        <span className="text-2xl font-bold">{match.awayScore ?? 0}</span>
                                      </>
                                    ) : (
                                      <span className="text-lg font-medium text-muted-foreground">vs</span>
                                    )}
                                  </Link>
                                </div>

                                {/* Away Team */}
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                      style={{ backgroundColor: awayTeam?.primaryColor || "#171717" }}
                                    >
                                      {awayTeam?.name.substring(0, 2).toUpperCase() || "??"}
                                    </div>
                                    <div>
                                      <p className="font-semibold">{awayTeam?.name || "Por definir"}</p>
                                      <p className="text-xs text-muted-foreground">{(awayTeam as any)?.clubName}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Match Details */}
                              {(match.scheduledDate || match.scheduledTime || venue) && (
                                <div className="flex flex-wrap items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                                  {(match.scheduledDate || match.scheduledTime) && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      <span>
                                        {match.scheduledDate
                                          ? match.scheduledDate.toLocaleDateString("es-AR", {
                                              weekday: "short",
                                              day: "numeric",
                                              month: "short",
                                            })
                                          : ""}
                                        {match.scheduledTime
                                          ? `${match.scheduledDate ? " · " : ""}${match.scheduledTime}`
                                          : ""}
                                      </span>
                                    </div>
                                  )}
                                  {venue && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      <span>
                                        {venue.name}
                                        {court ? ` - ${court.name}` : ""}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Card>
                )
              })}
          </div>
        )}
      </main>
    </div>
  )
}
