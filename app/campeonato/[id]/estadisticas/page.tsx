"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpCircle,
  BarChart3,
  Hand,
  Shield,
  Trophy,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getChampionshipById } from "@/lib/mock-data"

interface EstadisticasPageProps {
  params: Promise<{ id: string }>
}

type LeaderRow = {
  playerId: string
  games: number
  points: number
  assists: number
  rebounds: number
  steals: number
  blocks: number
  foulsReceived: number
  jerseyNumber: number | null
  firstName: string
  lastName: string
  teamName: string
}

type LeadersResponse = {
  topScorers: LeaderRow[]
  topRebounders: LeaderRow[]
  topAssistants: LeaderRow[]
  topStealers: LeaderRow[]
  topBlockers: LeaderRow[]
  topFoulsReceived: LeaderRow[]
}

export default function EstadisticasPage({ params }: EstadisticasPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const championship = getChampionshipById(id)

  const [leaders, setLeaders] = useState<LeadersResponse | null>(null)
  const [leadersError, setLeadersError] = useState<string | null>(null)
  const [leadersLoading, setLeadersLoading] = useState(false)

  useEffect(() => {
    let canceled = false
    const run = async () => {
      setLeadersLoading(true)
      setLeadersError(null)
      try {
        const res = await fetch(`/api/public/tournaments/${id}/leaders`, { cache: "no-store" })
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok) {
          if (canceled) return
          setLeaders(null)
          setLeadersError(json?.error ?? "No se pudieron cargar las estadísticas")
          setLeadersLoading(false)
          return
        }
        if (canceled) return
        setLeaders(json as LeadersResponse)
        setLeadersLoading(false)
      } catch (e) {
        if (canceled) return
        setLeaders(null)
        setLeadersError(e instanceof Error ? e.message : "Error desconocido")
        setLeadersLoading(false)
      }
    }

    if (id) void run()
    return () => {
      canceled = true
    }
  }, [id])

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

  const topScorers = useMemo(() => (leaders?.topScorers ?? []).slice(0, 10), [leaders])
  const topRebounders = useMemo(() => (leaders?.topRebounders ?? []).slice(0, 10), [leaders])
  const topAssistants = useMemo(() => (leaders?.topAssistants ?? []).slice(0, 10), [leaders])
  const topStealers = useMemo(() => (leaders?.topStealers ?? []).slice(0, 10), [leaders])
  const topBlockers = useMemo(() => (leaders?.topBlockers ?? []).slice(0, 10), [leaders])
  const topFoulsReceived = useMemo(() => (leaders?.topFoulsReceived ?? []).slice(0, 10), [leaders])

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
            <BarChart3 className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Estadísticas</h1>
              <p className="text-primary-foreground/70">{championship.name}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="points" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:w-auto lg:inline-grid lg:grid-cols-6">
            <TabsTrigger value="points" className="gap-2">
              <Trophy className="h-4 w-4" />
              Puntos
            </TabsTrigger>
            <TabsTrigger value="assists" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Asist.
            </TabsTrigger>
            <TabsTrigger value="rebounds" className="gap-2">
              <ArrowUpCircle className="h-4 w-4" />
              Rebotes
            </TabsTrigger>
            <TabsTrigger value="steals" className="gap-2">
              <Shield className="h-4 w-4" />
              Robos
            </TabsTrigger>
            <TabsTrigger value="blocks" className="gap-2">
              <Hand className="h-4 w-4" />
              Tapas
            </TabsTrigger>
            <TabsTrigger value="foulsReceived" className="gap-2">
              FR
            </TabsTrigger>
          </TabsList>

          <TabsContent value="points">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Máximos Goleadores
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {leadersLoading ? (
                  <div className="py-10 text-center text-muted-foreground">Cargando estadísticas...</div>
                ) : leadersError ? (
                  <div className="py-10 text-center text-destructive">{leadersError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Jugador</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead className="text-center">PJ</TableHead>
                          <TableHead className="text-center">PTS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topScorers.map((player, index) => {
                          return (
                            <TableRow key={player.playerId}>
                              <TableCell className="text-center">
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
                                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                    {player.jerseyNumber ?? "-"}
                                  </div>
                                  <div>
                                    <p className="font-medium">
                                      {player.firstName} {player.lastName}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{player.teamName}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">{player.games}</TableCell>
                              <TableCell className="text-center font-bold text-lg">{player.points}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assists">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5 text-green-500" />
                  Asistidoras del Torneo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {leadersLoading ? (
                  <div className="py-10 text-center text-muted-foreground">Cargando estadísticas...</div>
                ) : leadersError ? (
                  <div className="py-10 text-center text-destructive">{leadersError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Jugador</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead className="text-center">PJ</TableHead>
                          <TableHead className="text-center">AST</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topAssistants.map((player, index) => (
                          <TableRow key={player.playerId}>
                            <TableCell className="text-center">
                              {index + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                  {player.jerseyNumber ?? "-"}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {player.firstName} {player.lastName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{player.teamName}</span>
                            </TableCell>
                            <TableCell className="text-center">{player.games}</TableCell>
                            <TableCell className="text-center font-bold text-lg">{player.assists}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rebounds">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpCircle className="h-5 w-5 text-purple-500" />
                  Reboteras del Torneo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {leadersLoading ? (
                  <div className="py-10 text-center text-muted-foreground">Cargando estadísticas...</div>
                ) : leadersError ? (
                  <div className="py-10 text-center text-destructive">{leadersError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Jugador</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead className="text-center">PJ</TableHead>
                          <TableHead className="text-center">REB</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topRebounders.map((player, index) => (
                          <TableRow key={player.playerId}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                  {player.jerseyNumber ?? "-"}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {player.firstName} {player.lastName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{player.teamName}</span>
                            </TableCell>
                            <TableCell className="text-center">{player.games}</TableCell>
                            <TableCell className="text-center font-bold text-lg">{player.rebounds}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="steals">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-red-500" />
                  Recuperadoras del Torneo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {leadersLoading ? (
                  <div className="py-10 text-center text-muted-foreground">Cargando estadísticas...</div>
                ) : leadersError ? (
                  <div className="py-10 text-center text-destructive">{leadersError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Jugador</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead className="text-center">PJ</TableHead>
                          <TableHead className="text-center">ROB</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topStealers.map((player, index) => (
                          <TableRow key={player.playerId}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                  {player.jerseyNumber ?? "-"}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {player.firstName} {player.lastName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{player.teamName}</span>
                            </TableCell>
                            <TableCell className="text-center">{player.games}</TableCell>
                            <TableCell className="text-center font-bold text-lg">{player.steals}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blocks">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hand className="h-5 w-5 text-indigo-500" />
                  Taponadoras del Torneo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {leadersLoading ? (
                  <div className="py-10 text-center text-muted-foreground">Cargando estadísticas...</div>
                ) : leadersError ? (
                  <div className="py-10 text-center text-destructive">{leadersError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Jugador</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead className="text-center">PJ</TableHead>
                          <TableHead className="text-center">TAP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topBlockers.map((player, index) => (
                          <TableRow key={player.playerId}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                  {player.jerseyNumber ?? "-"}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {player.firstName} {player.lastName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{player.teamName}</span>
                            </TableCell>
                            <TableCell className="text-center">{player.games}</TableCell>
                            <TableCell className="text-center font-bold text-lg">{player.blocks}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="foulsReceived">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="font-semibold">FR</span>
                  Faltas recibidas del Torneo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {leadersLoading ? (
                  <div className="py-10 text-center text-muted-foreground">Cargando estadísticas...</div>
                ) : leadersError ? (
                  <div className="py-10 text-center text-destructive">{leadersError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Jugador</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead className="text-center">PJ</TableHead>
                          <TableHead className="text-center">FR</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topFoulsReceived.map((player: LeaderRow, index: number) => (
                          <TableRow key={player.playerId}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                  {player.jerseyNumber ?? "-"}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {player.firstName} {player.lastName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{player.teamName}</span>
                            </TableCell>
                            <TableCell className="text-center">{player.games}</TableCell>
                            <TableCell className="text-center font-bold text-lg">{player.foulsReceived}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
