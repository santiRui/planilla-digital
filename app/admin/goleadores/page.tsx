"use client"

import { useEffect, useMemo, useState } from "react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Trophy, Target, ArrowLeftRight, ArrowUpCircle, Shield, Hand } from "lucide-react"

export default function GoleadoresPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("")
  const [leaders, setLeaders] = useState<LeadersResponse | null>(null)
  const [loadingTournaments, setLoadingTournaments] = useState(true)
  const [loadingLeaders, setLoadingLeaders] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("points")

  useEffect(() => {
    const run = async () => {
      setLoadingTournaments(true)
      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, short_name, year, branch, status")
        .order("created_at", { ascending: false })

      if (error) {
        setError(error.message)
        setTournaments([])
        setLoadingTournaments(false)
        return
      }

      setTournaments((data ?? []) as Tournament[])
      setLoadingTournaments(false)
    }

    run()
  }, [supabase])

  const loadLeaders = async (tournamentId: string) => {
    if (!tournamentId) return
    setError(null)
    setLoadingLeaders(true)
    setLeaders(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión como administrador.")
        setLoadingLeaders(false)
        return
      }

      const res = await fetch(`/api/admin/tournaments/${tournamentId}/leaders`, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudieron cargar los goleadores")
        setLoadingLeaders(false)
        return
      }

      setLeaders(json as LeadersResponse)
      setLoadingLeaders(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
      setLoadingLeaders(false)
    }
  }

  const handleTournamentChange = (value: string) => {
    setSelectedTournamentId(value)
    if (value) {
      loadLeaders(value)
    } else {
      setLeaders(null)
    }
  }

  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId) || null

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Goleadores" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Goleadores y Líderes del Torneo</h1>
          <p className="text-muted-foreground mt-1">
            Visualizá los máximos anotadores, tripleros, asistidores, reboteros, recuperadores y taponadores por
            torneo.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium">Torneo</p>
            <Select value={selectedTournamentId} onValueChange={handleTournamentChange}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder={loadingTournaments ? "Cargando torneos..." : "Seleccionar torneo"} />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.year})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTournament && (
            <div className="text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Rama:</span> {selectedTournament.branch}
              </div>
              <div>
                <span className="font-medium">Estado:</span> {selectedTournament.status}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!selectedTournamentId ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Seleccioná un torneo para ver los líderes estadísticos.
          </CardContent>
        </Card>
      ) : loadingLeaders ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Cargando estadísticas agregadas del torneo...
          </CardContent>
        </Card>
      ) : !leaders ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay estadísticas disponibles para este torneo.
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full max-w-3xl grid-cols-6">
            <TabsTrigger value="points" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Puntos
            </TabsTrigger>
            <TabsTrigger value="threes" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Triples
            </TabsTrigger>
            <TabsTrigger value="assists" className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Asistencias
            </TabsTrigger>
            <TabsTrigger value="rebounds" className="flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4" />
              Rebotes
            </TabsTrigger>
            <TabsTrigger value="steals" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Robos
            </TabsTrigger>
            <TabsTrigger value="blocks" className="flex items-center gap-2">
              <Hand className="h-4 w-4" />
              Tapas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="points">
            <LeadersTable
              title="Goleadores del torneo"
              icon={<Trophy className="h-5 w-5 text-yellow-500" />}
              rows={leaders.topScorers}
              valueKey="points"
              valueLabel="PTS"
              extraColumns={(row) => [
                { label: "PJ", value: row.games },
                {
                  label: "PPP",
                  value: row.games ? (row.points / row.games).toFixed(1) : "-",
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="threes">
            <LeadersTable
              title="Tripleros del torneo"
              icon={<Target className="h-5 w-5 text-blue-500" />}
              rows={leaders.topThreePointers}
              valueKey="t3Made"
              valueLabel="3PM"
              extraColumns={(row) => [
                { label: "3PA", value: row.t3Att },
                {
                  label: "%3P",
                  value: row.t3Att ? `${Math.round((row.t3Made / row.t3Att) * 100)}%` : "-",
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="assists">
            <LeadersTable
              title="Asistidores del torneo"
              icon={<ArrowLeftRight className="h-5 w-5 text-green-500" />}
              rows={leaders.topAssistants}
              valueKey="assists"
              valueLabel="AST"
              extraColumns={(row) => [{ label: "PJ", value: row.games }]}
            />
          </TabsContent>

          <TabsContent value="rebounds">
            <LeadersTable
              title="Reboteros del torneo"
              icon={<ArrowUpCircle className="h-5 w-5 text-purple-500" />}
              rows={leaders.topRebounders}
              valueKey="rebounds"
              valueLabel="REB"
              extraColumns={(row) => [{ label: "PJ", value: row.games }]}
            />
          </TabsContent>

          <TabsContent value="steals">
            <LeadersTable
              title="Recuperadores del torneo"
              icon={<Shield className="h-5 w-5 text-red-500" />}
              rows={leaders.topStealers}
              valueKey="steals"
              valueLabel="ROB"
              extraColumns={(row) => [{ label: "PJ", value: row.games }]}
            />
          </TabsContent>

          <TabsContent value="blocks">
            <LeadersTable
              title="Taponadores del torneo"
              icon={<Hand className="h-5 w-5 text-indigo-500" />}
              rows={leaders.topBlockers}
              valueKey="blocks"
              valueLabel="BLK"
              extraColumns={(row) => [{ label: "PJ", value: row.games }]}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

type Tournament = {
  id: string
  name: string
  short_name: string
  year: number
  branch: string
  status: string
}

type LeaderRow = {
  playerId: string
  teamId: string
  games: number
  points: number
  t3Made: number
  t3Att: number
  assists: number
  rebounds: number
  steals: number
  blocks: number
  jerseyNumber: number | null
  firstName: string
  lastName: string
  teamName: string
}

type LeadersResponse = {
  topScorers: LeaderRow[]
  topThreePointers: LeaderRow[]
  topAssistants: LeaderRow[]
  topRebounders: LeaderRow[]
  topStealers: LeaderRow[]
  topBlockers: LeaderRow[]
}

function LeadersTable({
  title,
  icon,
  rows,
  valueKey,
  valueLabel,
  extraColumns,
}: {
  title: string
  icon: React.ReactNode
  rows?: LeaderRow[]
  valueKey: keyof LeaderRow
  valueLabel: string
  extraColumns?: (row: LeaderRow) => { label: string; value: string | number }[]
}) {
  const safeRows = rows ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {safeRows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay datos disponibles.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead className="w-14 text-center">N°</TableHead>
                  <TableHead>Jugador</TableHead>
                  <TableHead>Equipo</TableHead>
                  {extraColumns &&
                    extraColumns(safeRows[0]).map((col) => (
                      <TableHead key={col.label} className="text-center">
                        {col.label}
                      </TableHead>
                    ))}
                  <TableHead className="text-center">{valueLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeRows.map((row, index) => (
                  <TableRow key={`${row.playerId}-${row.teamId}`}>
                    <TableCell className="text-center font-medium">{index + 1}</TableCell>
                    <TableCell className="text-center">{row.jerseyNumber ?? "-"}</TableCell>
                    <TableCell>{`${row.firstName} ${row.lastName}`}</TableCell>
                    <TableCell>{row.teamName}</TableCell>
                    {extraColumns &&
                      extraColumns(row).map((col) => (
                        <TableCell key={col.label} className="text-center">
                          {col.value}
                        </TableCell>
                      ))}
                    <TableCell className="text-center font-bold">{row[valueKey] as any}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
