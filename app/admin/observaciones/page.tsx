"use client"

import { useEffect, useMemo, useState } from "react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface MatchObservationRow {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  status: string
  statusReason: string
  scheduledAt: string | null
  finishedAt: string | null
}

interface TournamentRow {
  id: string
  name: string
  year: number | null
}

interface TeamRow {
  id: string
  name: string
}

export default function ObservacionesPage() {
  const [matches, setMatches] = useState<MatchObservationRow[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterType, setFilterType] = useState<"all" | "onlyProtest">("all")
  const [filterDate, setFilterDate] = useState<string>("")

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión como administrador para ver las observaciones.")
        setLoading(false)
        return
      }

      try {
        const matchesRes = await fetch("/api/admin/matches", {
          headers: { Authorization: `Bearer ${token}` },
        })

        const matchesJson = (await matchesRes.json().catch(() => null)) as any

        if (!matchesRes.ok) {
          throw new Error(matchesJson?.error ?? "No se pudieron cargar los partidos")
        }

        const rawMatches = (matchesJson.matches ?? []) as any[]

        const withReason = rawMatches.filter(
          (m) => typeof m.status_reason === "string" && m.status_reason.trim() !== "",
        )

        const rows: MatchObservationRow[] = withReason.map((m) => ({
          id: String(m.id),
          tournamentId: String(m.tournament_id),
          homeTeamId: String(m.home_team_id),
          awayTeamId: String(m.away_team_id),
          status: String(m.status ?? ""),
          statusReason: String(m.status_reason ?? ""),
          scheduledAt: m.scheduled_at ?? null,
          finishedAt: m.finished_at ?? null,
        }))

        setMatches(rows)

        const tournamentIds = Array.from(new Set(rows.map((m) => m.tournamentId))).filter(Boolean)
        const teamIds = Array.from(new Set(rows.flatMap((m) => [m.homeTeamId, m.awayTeamId]))).filter(Boolean)

        if (tournamentIds.length > 0) {
          const { data: tData, error: tError } = await supabase
            .from("tournaments")
            .select("id, name, year")
            .in("id", tournamentIds)

          if (tError) throw new Error(tError.message)
          setTournaments((tData ?? []).map((t: any) => ({ id: t.id, name: t.name, year: t.year })) as TournamentRow[])
        }

        if (teamIds.length > 0) {
          const { data: teamData, error: teamError } = await supabase
            .from("teams")
            .select("id, name")
            .in("id", teamIds)

          if (teamError) throw new Error(teamError.message)
          setTeams((teamData ?? []).map((t: any) => ({ id: t.id, name: t.name })) as TeamRow[])
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar observaciones"
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [supabase])

  const getTournamentLabel = (id: string) => {
    const t = tournaments.find((tt) => tt.id === id)
    if (!t) return "-"
    return t.year ? `${t.name} ${t.year}` : t.name
  }

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "-"

  const parseStatusReason = (reason: string) => {
    const trimmed = reason.trim()
    if (!trimmed) return { isProtest: false, text: "" }
    if (trimmed.toLowerCase().startsWith("protesta:")) {
      return { isProtest: true, text: trimmed.slice("protesta:".length).trim() }
    }
    return { isProtest: false, text: trimmed }
  }

  const filteredMatches = matches.filter((m) => {
    const { isProtest } = parseStatusReason(m.statusReason)

    if (filterType === "onlyProtest" && !isProtest) return false

    if (filterDate) {
      // Usamos primero scheduled_at (jornada programada) y si no hay, caemos a finished_at
      const rawDate = m.scheduledAt ?? m.finishedAt
      if (!rawDate) return false
      const d = new Date(rawDate)
      if (Number.isNaN(d.getTime())) return false
      const isoDay = d.toISOString().slice(0, 10)
      if (isoDay !== filterDate) return false
    }

    return true
  })

  return (
    <div className="p-4 space-y-4">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Observaciones y Protestas", href: "/admin/observaciones" },
        ]}
      />

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Observaciones y Protestas</h1>
              <p className="text-sm text-muted-foreground">
                Listado de partidos con observaciones o firmados bajo protesta desde la planilla digital.
              </p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <div className="flex gap-2">
                <Select
                  value={filterType}
                  onValueChange={(val) => setFilterType(val as "all" | "onlyProtest")}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las observaciones</SelectItem>
                    <SelectItem value="onlyProtest">Solo bajo protesta</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  className="w-[160px]"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Podés ver todas las observaciones o solo las firmadas bajo protesta y filtrar por jornada (fecha del partido).
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando observaciones...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : filteredMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay partidos con observaciones registradas.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Torneo</TableHead>
                    <TableHead>Partido</TableHead>
                    <TableHead className="w-[120px]">Estado</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="w-[160px]">Fecha cierre</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMatches.map((m) => {
                    const { isProtest, text } = parseStatusReason(m.statusReason)
                    const tournamentLabel = getTournamentLabel(m.tournamentId)
                    const homeName = getTeamName(m.homeTeamId)
                    const awayName = getTeamName(m.awayTeamId)

                    const finishedDate = m.finishedAt ? new Date(m.finishedAt) : null
                    const finishedLabel = finishedDate
                      ? `${finishedDate.toLocaleDateString()} ${finishedDate.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : "-"

                    return (
                      <TableRow key={m.id}>
                        <TableCell className="align-top text-sm">{tournamentLabel}</TableCell>
                        <TableCell className="align-top text-sm">
                          <div className="font-medium">
                            {homeName} vs {awayName}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          <div className="flex flex-col gap-1">
                            <span className="uppercase text-xs tracking-wide text-muted-foreground">{m.status}</span>
                            {isProtest && <Badge variant="destructive">Bajo protesta</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm whitespace-pre-line">{text || m.statusReason}</TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">{finishedLabel}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
