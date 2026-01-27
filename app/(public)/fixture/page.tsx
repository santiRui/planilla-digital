"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BadgeStatus } from "@/components/ui/badge-status"
import { useAppStore } from "@/lib/store"
import { Calendar, Clock, MapPin } from "lucide-react"

export default function FixturePage() {
  const { matches, teams, categories, venues, courts } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id || "")

  const categoryMatches = matches.filter((m) => m.categoryId === selectedCategory)

  const categoryTeamIds = Array.from(
    new Set(categoryMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean) as string[]),
  )

  // Group matches by round
  const matchesByRound = categoryMatches.reduce(
    (acc, match) => {
      const round = match.round
      if (!acc[round]) acc[round] = []
      acc[round].push(match)
      return acc
    },
    {} as Record<number, typeof matches>,
  )

  const rounds = Object.keys(matchesByRound)
    .map(Number)
    .sort((a, b) => a - b)

  const getByeTeamIdForRound = (round: number) => {
    if (categoryTeamIds.length % 2 === 0) return null
    const roundMatches = matchesByRound[round] ?? []
    const used = new Set<string>()
    for (const match of roundMatches) {
      used.add(match.homeTeamId)
      used.add(match.awayTeamId)
    }
    return categoryTeamIds.find((id) => !used.has(id)) ?? null
  }

  const getTeam = (id: string) => teams.find((t) => t.id === id)
  const getVenueName = (id?: string) => venues.find((v) => v.id === id)?.name
  const getCourtName = (id?: string) => courts.find((c) => c.id === id)?.name

  const formatDate = (date?: Date) => {
    if (!date) return null
    return new Date(date).toLocaleDateString("es-AR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Fixture</h1>
          <p className="text-muted-foreground mt-1">Calendario de partidos del torneo</p>
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

      {rounds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No hay partidos programados</p>
            <p className="text-sm text-muted-foreground">El fixture para esta categoría aún no ha sido generado.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={String(rounds[0])} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
            {rounds.map((round) => (
              <TabsTrigger key={round} value={String(round)} className="px-4">
                Fecha {round}
              </TabsTrigger>
            ))}
          </TabsList>

          {rounds.map((round) => (
            <TabsContent key={round} value={String(round)} className="space-y-4">
              {matchesByRound[round].map((match) => {
                const homeTeam = getTeam(match.homeTeamId)
                const awayTeam = getTeam(match.awayTeamId)

                return (
                  <Card key={match.id} className="overflow-hidden">
                    <div
                      className="h-1"
                      style={{
                        background:
                          match.status === "en_juego"
                            ? "var(--color-live)"
                            : match.status === "finalizado"
                              ? "var(--color-success)"
                              : "var(--muted)",
                      }}
                    />
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        {/* Home Team */}
                        <div className="flex-1 flex items-center gap-3 justify-end text-right">
                          <div>
                            <p className="font-semibold">{homeTeam?.name || "TBD"}</p>
                            <p className="text-xs text-muted-foreground">{homeTeam?.neighborhood}</p>
                          </div>
                          <div
                            className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                            style={{ backgroundColor: homeTeam?.primaryColor || "#666" }}
                          >
                            {homeTeam?.name.substring(0, 2).toUpperCase() || "??"}
                          </div>
                        </div>

                        {/* Score / VS */}
                        <div className="flex flex-col items-center px-4 sm:px-8">
                          {match.status === "programado" ? (
                            <span className="text-2xl font-bold text-muted-foreground">VS</span>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="text-3xl font-bold">{match.homeScore}</span>
                              <span className="text-xl text-muted-foreground">-</span>
                              <span className="text-3xl font-bold">{match.awayScore}</span>
                            </div>
                          )}
                          <BadgeStatus status={match.status} className="mt-2" />
                        </div>

                        {/* Away Team */}
                        <div className="flex-1 flex items-center gap-3 text-left">
                          <div
                            className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                            style={{ backgroundColor: awayTeam?.primaryColor || "#666" }}
                          >
                            {awayTeam?.name.substring(0, 2).toUpperCase() || "??"}
                          </div>
                          <div>
                            <p className="font-semibold">{awayTeam?.name || "TBD"}</p>
                            <p className="text-xs text-muted-foreground">{awayTeam?.neighborhood}</p>
                          </div>
                        </div>
                      </div>

                      {/* Match Info */}
                      {(match.scheduledDate || match.venueId) && (
                        <div className="flex flex-wrap items-center justify-center gap-4 mt-4 pt-4 border-t text-sm text-muted-foreground">
                          {match.scheduledDate && (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(match.scheduledDate)}</span>
                            </div>
                          )}
                          {match.scheduledTime && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-4 w-4" />
                              <span>{match.scheduledTime}</span>
                            </div>
                          )}
                          {match.venueId && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4" />
                              <span>{getVenueName(match.venueId)}</span>
                              {match.courtId && <span>- {getCourtName(match.courtId)}</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {(() => {
                const byeTeamId = getByeTeamIdForRound(round)
                if (!byeTeamId) return null
                const byeTeam = getTeam(byeTeamId)
                return (
                  <Card className="overflow-hidden" key={`bye-${round}`}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                            style={{ backgroundColor: byeTeam?.primaryColor || "#666" }}
                          >
                            {byeTeam?.name.substring(0, 2).toUpperCase() || "??"}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{byeTeam?.name || "TBD"}</p>
                            <p className="text-sm text-muted-foreground">Libre</p>
                          </div>
                        </div>
                        <div className="text-sm font-medium text-muted-foreground">Fecha {round}</div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })()}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
