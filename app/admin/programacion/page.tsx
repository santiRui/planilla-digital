"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Calendar, MapPin, Clock, Edit2 } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { BadgeStatus } from "@/components/ui/badge-status"

export default function ProgramacionPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [officials, setOfficials] = useState<Official[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])

  const [selectedTournament, setSelectedTournament] = useState<string>("")
  const [editingMatch, setEditingMatch] = useState<MatchRow | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suspendMatch, setSuspendMatch] = useState<MatchRow | null>(null)
  const [suspendReason, setSuspendReason] = useState("")
  const [suspendSubmitting, setSuspendSubmitting] = useState(false)
  const [suspendError, setSuspendError] = useState<string | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [formData, setFormData] = useState({
    scheduledDate: "",
    scheduledTime: "",
    venueId: "",
    courtId: "",
    refereeIds: ["", "", ""] as string[],
    tableOfficialIds: ["", "", ""] as string[],
  })

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const [
        { data: tournamentsData, error: tournamentsError },
        session,
      ] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id, name, year, branch, status, created_at, category_id")
          .order("created_at", { ascending: false }),
        supabase.auth.getSession(),
      ])

      if (tournamentsError) setError(tournamentsError.message)

      const nextTournaments = (tournamentsData ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        year: t.year,
        branch: t.branch,
        status: t.status,
        createdAt: t.created_at,
        categoryId: t.category_id,
      })) as Tournament[]
      setTournaments(nextTournaments)

      const initialTournamentId = nextTournaments[0]?.id
      setSelectedTournament((prev) => prev || initialTournamentId || "")

      const token = session.data.session?.access_token
      if (!token) {
        setMatches([])
        setOfficials([])
        setVenues([])
        setTeams([])
        setError((prev) => prev ?? "Tenés que iniciar sesión para ver Programación.")
        setLoading(false)
        return
      }

      const [officialsRes, venuesRes] = await Promise.all([
        fetch("/api/admin/officials", { headers: { Authorization: `Bearer ${token}` } }),
        supabase.from("venues").select("id, name").order("created_at", { ascending: true }),
      ])

      setMatches([])
      setTeams([])

      const officialsJson = (await officialsRes.json().catch(() => null)) as any
      if (!officialsRes.ok) {
        setOfficials([])
        setError((prev) => prev ?? (officialsJson?.error ?? "No se pudieron cargar los oficiales"))
      } else {
        setOfficials((officialsJson.officials ?? []).map(mapOfficialFromDb) as Official[])
      }

      if (venuesRes.error) setError((prev) => prev ?? venuesRes.error.message)
      setVenues((venuesRes.data ?? []).map((v: any) => ({ id: v.id, name: v.name })) as Venue[])

      setLoading(false)
    }

    run()
  }, [supabase])

  useEffect(() => {
    const run = async () => {
      if (!selectedTournament) return
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return

      const tournament = tournaments.find((t) => t.id === selectedTournament)
      const categoryId = tournament?.categoryId

      setLoading(true)
      setError(null)

      if (!categoryId) {
        setTeams([])
        setMatches([])
        setLoading(false)
        return
      }

      const { data: teamCategoryRows, error: teamCategoryError } = await supabase
        .from("team_categories")
        .select("team_id")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: true })

      if (teamCategoryError) {
        setTeams([])
        setMatches([])
        setError(teamCategoryError.message)
        setLoading(false)
        return
      }

      const teamIds = Array.from(new Set((teamCategoryRows ?? []).map((r: any) => r.team_id).filter(Boolean))) as string[]
      if (teamIds.length === 0) {
        setTeams([])
      } else {
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("id, name")
          .in("id", teamIds)
          .order("name", { ascending: true })

        if (teamsError) {
          setTeams([])
          setError(teamsError.message)
        } else {
          setTeams((teamsData ?? []).map((t: any) => ({ id: t.id, name: t.name })) as Team[])
        }
      }

      const res = await fetch(`/api/admin/matches?tournamentId=${encodeURIComponent(selectedTournament)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setMatches([])
        setError(json?.error ?? "No se pudieron cargar los partidos")
      } else {
        const rawMatches = (json.matches ?? []) as any[]
        setMatches(rawMatches.map(mapMatchFromDb) as MatchRow[])

        const matchTeamIds = Array.from(
          new Set(
            rawMatches
              .flatMap((m) => [m?.home_team_id, m?.away_team_id])
              .filter(Boolean)
              .map((id) => String(id)),
          ),
        ) as string[]

        if (matchTeamIds.length > 0) {
          const { data: matchTeams, error: matchTeamsError } = await supabase
            .from("teams")
            .select("id, name")
            .in("id", matchTeamIds)

          if (matchTeamsError) {
            setError((prev) => prev ?? matchTeamsError.message)
          } else {
            setTeams((matchTeams ?? []).map((t: any) => ({ id: t.id, name: t.name })) as Team[])
          }
        }
      }

      setLoading(false)
    }

    run()
  }, [selectedTournament, supabase, tournaments])

  const categoryMatches = matches
    .filter((m) => m.status !== "finalizado")
    .sort((a, b) => a.round - b.round)

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "TBD"
  const getVenueName = (id?: string) => venues.find((v) => v.id === id)?.name || "-"
  const getOfficialName = (id: string) => officials.find((o) => o.id === id)?.fullName || "-"

  const referees = officials.filter((o) => o.isReferee)
  const tableOfficialsList = officials.filter((o) => o.isTableOfficial)

  const dedupeIds = (ids: string[]) => {
    const seen = new Set<string>()
    return ids.map((id) => {
      if (!id) return ""
      if (seen.has(id)) return ""
      seen.add(id)
      return id
    })
  }

  const refereeOptionsForIndex = (index: number) => {
    const selectedElsewhere = new Set(
      formData.refereeIds.filter((id, idx) => Boolean(id) && idx !== index) as string[],
    )
    const selectedInTable = new Set(formData.tableOfficialIds.filter(Boolean) as string[])
    return referees.filter((r) => !selectedElsewhere.has(r.id) && !selectedInTable.has(r.id))
  }

  const tableOfficialOptionsForIndex = (index: number) => {
    const selectedElsewhere = new Set(
      formData.tableOfficialIds.filter((id, idx) => Boolean(id) && idx !== index) as string[],
    )
    const selectedInReferees = new Set(formData.refereeIds.filter(Boolean) as string[])
    return tableOfficialsList.filter((o) => !selectedElsewhere.has(o.id) && !selectedInReferees.has(o.id))
  }

  const openEditDialog = (match: MatchRow) => {
    setEditingMatch(match)
    const nextReferees = [...(match.refereeIds ?? [])].slice(0, 3)
    while (nextReferees.length < 3) nextReferees.push("")
    const nextTableOfficials = [...(match.tableOfficialIds ?? [])].slice(0, 3)
    while (nextTableOfficials.length < 3) nextTableOfficials.push("")

    const refereeSet = new Set(nextReferees.filter(Boolean))
    const cleanedTableOfficials = nextTableOfficials.map((id) => (id && refereeSet.has(id) ? "" : id))

    const scheduledDateValue = match.scheduledDate
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Argentina/Salta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(match.scheduledDate))
      : ""

    setFormData({
      scheduledDate: scheduledDateValue,
      scheduledTime: match.scheduledTime || "",
      venueId: match.venueId || "",
      courtId: "",
      refereeIds: nextReferees,
      tableOfficialIds: cleanedTableOfficials,
    })
    setIsOpen(true)
  }

  const handleSubmit = async () => {
    if (!editingMatch) return
    setSubmitting(true)
    setError(null)
    try {
      if (formData.scheduledDate && formData.scheduledTime) {
        const candidate = new Date(`${formData.scheduledDate}T${formData.scheduledTime}:00-03:00`)
        const now = new Date()
        if (!Number.isNaN(candidate.getTime()) && candidate.getTime() < now.getTime()) {
          setError("No podés programar un partido en una fecha u horario pasado.")
          setSubmitting(false)
          return
        }
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión para guardar la programación.")
        return
      }

      const res = await fetch(`/api/admin/matches/${editingMatch.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduledDate: formData.scheduledDate || null,
          scheduledTime: formData.scheduledTime || null,
          venueId: formData.venueId || null,
          courtId: null,
          refereeIds: formData.refereeIds.filter(Boolean),
          tableOfficialIds: formData.tableOfficialIds.filter(Boolean),
        }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo guardar")
        return
      }

      const updated = mapMatchFromDb(json.match)
      setMatches((prev) => prev.map((m) => (m.id === editingMatch.id ? updated : m)))

      setIsOpen(false)
      setEditingMatch(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSuspend = async () => {
    if (!suspendMatch) return
    setSuspendSubmitting(true)
    setSuspendError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setSuspendError("Tenés que iniciar sesión para suspender el partido.")
        return
      }

      const body = {
        scheduledDate: suspendMatch.scheduledDate
          ? new Date(suspendMatch.scheduledDate).toISOString().split("T")[0]
          : null,
        scheduledTime: suspendMatch.scheduledTime ?? null,
        venueId: suspendMatch.venueId ?? null,
        courtId: suspendMatch.courtId ?? null,
        refereeIds: suspendMatch.refereeIds,
        tableOfficialIds: suspendMatch.tableOfficialIds,
        status: "suspendido" as const,
        statusReason: suspendReason || null,
      }

      const res = await fetch(`/api/admin/matches/${suspendMatch.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setSuspendError(json?.error ?? "No se pudo suspender el partido")
        return
      }

      const updated = mapMatchFromDb(json.match)
      setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      setSuspendMatch(null)
      setSuspendReason("")
    } finally {
      setSuspendSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Programación" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Programación</h1>
          <p className="text-muted-foreground mt-1">Gestiona fechas, horarios, sedes y oficiales.</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedTournament} onValueChange={setSelectedTournament}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Seleccionar torneo" />
            </SelectTrigger>
            <SelectContent>
              {tournaments.map((tournament) => (
                <SelectItem key={tournament.id} value={tournament.id}>
                  {tournament.name}
                  {tournament.year ? ` ${tournament.year}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando programación...</CardContent>
        </Card>
      ) : !selectedTournament ? (
        <EmptyState
          icon={Calendar}
          title="Selecciona un torneo"
          description="Elige un torneo para ver y editar su programación."
        />
      ) : !tournaments.find((t) => t.id === selectedTournament)?.categoryId ? (
        <EmptyState
          icon={Calendar}
          title="No hay categorías"
          description="Este torneo todavía no tiene una categoría creada."
        />
      ) : categoryMatches.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No hay partidos por programar"
          description="Todos los partidos de esta categoría ya han sido programados o finalizados."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Partido</TableHead>
                  <TableHead>Día/Hora</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Árbitros</TableHead>
                  <TableHead>Mesa</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryMatches.map((match) => (
                  <TableRow key={match.id}>
                    <TableCell className="font-medium">Fecha {match.round}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {match.scheduledDate ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>{new Date(match.scheduledDate).toLocaleDateString("es-AR")}</span>
                            {match.scheduledTime && (
                              <>
                                <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                                <span>{match.scheduledTime}</span>
                              </>
                            )}
                          </div>
                          <BadgeStatus status={match.status as any} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Sin programar</span>
                          <BadgeStatus status={match.status as any} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {match.venueId ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {getVenueName(match.venueId)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {match.refereeIds.length > 0 ? (
                        <div className="text-sm">{match.refereeIds.map((id) => getOfficialName(id)).join(", ")}</div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {match.tableOfficialIds.length > 0 ? (
                        <div className="text-sm">
                          {match.tableOfficialIds.map((id) => getOfficialName(id)).join(", ")}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(match)}>
                        <Edit2 className="h-4 w-4" />
                        <span className="sr-only">Editar programación</span>
                      </Button>
                      {match.status === "en_juego" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSuspendMatch(match)
                            setSuspendReason("")
                            setSuspendError(null)
                          }}
                        >
                          Suspender
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Programar Partido</DialogTitle>
            <DialogDescription>
              {editingMatch && (
                <>
                  {getTeamName(editingMatch.homeTeamId)} vs {getTeamName(editingMatch.awayTeamId)} - Fecha{" "}
                  {editingMatch.round}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="date">Fecha</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.scheduledDate}
                  onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="time">Horario</Label>
                <Input
                  id="time"
                  type="time"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="venue">Sede</Label>
              <Select
                value={formData.venueId}
                onValueChange={(venueId) => setFormData({ ...formData, venueId, courtId: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      {venue.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Árbitros</Label>
              <Select
                value={formData.refereeIds[0] || ""}
                onValueChange={(value) => {
                  const next = [...formData.refereeIds]
                  next[0] = value
                  setFormData({ ...formData, refereeIds: dedupeIds(next) })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Árbitro principal" />
                </SelectTrigger>
                <SelectContent>
                  {refereeOptionsForIndex(0).map((ref) => (
                    <SelectItem key={ref.id} value={ref.id}>
                      {ref.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={formData.refereeIds[1] || ""}
                onValueChange={(value) => {
                  const next = [...formData.refereeIds]
                  next[1] = value
                  setFormData({ ...formData, refereeIds: dedupeIds(next) })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Árbitro 2 (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {refereeOptionsForIndex(1).map((ref) => (
                    <SelectItem key={ref.id} value={ref.id}>
                      {ref.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={formData.refereeIds[2] || ""}
                onValueChange={(value) => {
                  const next = [...formData.refereeIds]
                  next[2] = value
                  setFormData({ ...formData, refereeIds: dedupeIds(next) })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Árbitro 3 (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {refereeOptionsForIndex(2).map((ref) => (
                    <SelectItem key={ref.id} value={ref.id}>
                      {ref.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Oficiales de Mesa</Label>
              <Select
                value={formData.tableOfficialIds[0] || ""}
                onValueChange={(value) => {
                  const next = [...formData.tableOfficialIds]
                  next[0] = value
                  setFormData({ ...formData, tableOfficialIds: dedupeIds(next) })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mesa 1" />
                </SelectTrigger>
                <SelectContent>
                  {tableOfficialOptionsForIndex(0).map((official) => (
                    <SelectItem key={official.id} value={official.id}>
                      {official.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={formData.tableOfficialIds[1] || ""}
                onValueChange={(value) => {
                  const next = [...formData.tableOfficialIds]
                  next[1] = value
                  setFormData({ ...formData, tableOfficialIds: dedupeIds(next) })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mesa 2 (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {tableOfficialOptionsForIndex(1).map((official) => (
                    <SelectItem key={official.id} value={official.id}>
                      {official.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={formData.tableOfficialIds[2] || ""}
                onValueChange={(value) => {
                  const next = [...formData.tableOfficialIds]
                  next[2] = value
                  setFormData({ ...formData, tableOfficialIds: dedupeIds(next) })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mesa 3 (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {tableOfficialOptionsForIndex(2).map((official) => (
                    <SelectItem key={official.id} value={official.id}>
                      {official.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar Programación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
      <Dialog open={!!suspendMatch} onOpenChange={(open) => (!open ? setSuspendMatch(null) : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Suspender partido</DialogTitle>
            <DialogDescription>
              {suspendMatch && (
                <>
                  {getTeamName(suspendMatch.homeTeamId)} vs {getTeamName(suspendMatch.awayTeamId)} - Fecha{" "}
                  {suspendMatch.round}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="suspend-reason">Motivo (opcional)</Label>
              <Input
                id="suspend-reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Ej: Corte de luz, humedad en la cancha, etc."
              />
            </div>
            {suspendError && <p className="text-sm text-destructive">{suspendError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendMatch(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSuspend} disabled={suspendSubmitting}>
              {suspendSubmitting ? "Suspendiendo..." : "Confirmar suspensión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Tournament = {
  id: string
  name: string
  year: number
  branch: string
  status: string
  createdAt: string
  categoryId?: string | null
}

type Team = {
  id: string
  name: string
}

type Venue = {
  id: string
  name: string
}

type Court = {
  id: string
  venueId: string
  name: string
}

type Official = {
  id: string
  fullName: string
  isReferee: boolean
  isTableOfficial: boolean
}

type MatchRow = {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  round: number
  phase: string
  status: "programado" | "en_juego" | "finalizado"
  scheduledDate?: Date
  scheduledTime?: string
  venueId?: string
  courtId?: string
  refereeIds: string[]
  tableOfficialIds: string[]
}

function mapOfficialFromDb(row: any): Official {
  return {
    id: row.id,
    fullName: row.full_name,
    isReferee: Boolean(row.is_referee),
    isTableOfficial: Boolean(row.is_table_official),
  }
}

function mapMatchFromDb(row: any): MatchRow {
  const rawScheduled: string | null = row.scheduled_at ?? null
  const scheduledAt = rawScheduled
    ? new Date(
        /Z$/i.test(rawScheduled) || /[+-]\d{2}:\d{2}$/.test(rawScheduled) ? rawScheduled : `${rawScheduled}-03:00`,
      )
    : undefined
  const scheduledTime = scheduledAt
    ? new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Salta",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(scheduledAt)
    : undefined
  const assignments = (row.match_official_assignments ?? []) as Array<{ user_id: string; role: string }>

  const refereeIds = assignments.filter((a) => a.role === "arbitro").map((a) => a.user_id)
  const tableOfficialIds = assignments.filter((a) => a.role === "oficial_mesa").map((a) => a.user_id)

  return {
    id: row.id,
    tournamentId: row.tournament_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    round: row.round,
    phase: row.phase,
    status: row.status,
    scheduledDate: scheduledAt,
    scheduledTime,
    venueId: row.venue_id ?? undefined,
    courtId: row.court_id ?? undefined,
    refereeIds,
    tableOfficialIds,
  }
}
