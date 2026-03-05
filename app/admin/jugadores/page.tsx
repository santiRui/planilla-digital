"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Plus, UserCircle, Edit, MoreHorizontal, AlertCircle } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function JugadoresPage() {
  const searchParams = useSearchParams()
  const initialTeamFilter = searchParams.get("equipo") || "all"

  const [isOpen, setIsOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<PlayerRow | null>(null)
  const [filterTeam, setFilterTeam] = useState(initialTeamFilter)
  const [search, setSearch] = useState("")
  const [filterFederated, setFilterFederated] = useState<"all" | "federated" | "not_federated">("all")
  const [deleteTarget, setDeleteTarget] = useState<PlayerRow | null>(null)
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [teamInput, setTeamInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<{ title: string; description?: string } | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dni: "",
    birthDate: "",
    jerseyNumber: 0,
    teamId: "",
    isFederated: true,
    federatedCategory: "mayores" as "mayores" | "intermedia",
    labasSeasons: 0,
  })
  const [jerseyNumberInput, setJerseyNumberInput] = useState<string>("0")
  const [labasSeasonsInput, setLabasSeasonsInput] = useState<string>("0")

  const teamNameCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    teams.forEach((t) => {
      counts[t.name] = (counts[t.name] ?? 0) + 1
    })
    return counts
  }, [teams])

  const teamLabelFor = useMemo(() => {
    return (team: TeamOption) => {
      const dupCount = teamNameCounts[team.name] ?? 0
      return dupCount > 1 ? `${team.name} (${team.id.slice(0, 6)})` : team.name
    }
  }, [teamNameCounts])

  const teamLabelToId = useMemo(() => {
    const map: Record<string, string> = {}
    teams.forEach((t) => {
      const label = teamLabelFor(t)
      map[label] = t.id
    })
    return map
  }, [teams, teamLabelFor])

  const teamIdToLabel = useMemo(() => {
    const map: Record<string, string> = {}
    teams.forEach((t) => {
      map[t.id] = teamLabelFor(t)
    })
    return map
  }, [teams, teamLabelFor])

  const teamOptions = useMemo(() => {
    return teams
      .map((t) => teamLabelFor(t))
      .sort((a, b) => a.localeCompare(b))
  }, [teams, teamLabelFor])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const [{ data: teamsData, error: teamsError }, { data: playersData, error: playersError }] = await Promise.all([
        supabase.from("teams").select("id, name").order("created_at", { ascending: true }),
        supabase
          .from("players")
          .select(
            "id, team_id, first_name, last_name, dni, birth_date, jersey_number, height_cm, is_federated, federated_category, labas_seasons, scoring, photo_url, created_at",
          )
          .order("jersey_number", { ascending: true }),
      ])

      if (teamsError) setError(teamsError.message)
      if (playersError) setError(playersError.message)

      setTeams((teamsData ?? []) as TeamOption[])
      setPlayers((playersData ?? []).map(mapPlayerFromDb) as PlayerRow[])
      setLoading(false)
    }

    run()
  }, [supabase])

  const handleSubmit = async () => {
    setFormError(null)
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setFormError({ title: "No autorizado", description: "Tenés que iniciar sesión para gestionar jugadores." })
        return
      }

      const jerseyNumber = Number.parseInt(jerseyNumberInput, 10)
      if (!jerseyNumberInput.trim() || !Number.isFinite(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 99) {
        setFormError({
          title: "Faltan datos",
          description: "Completá el número de camiseta (0 a 99).",
        })
        return
      }

      const parsedLabas = Number.parseInt(labasSeasonsInput, 10)
      const labasSeasons = !labasSeasonsInput.trim() || !Number.isFinite(parsedLabas) ? 0 : Math.max(0, parsedLabas)

      if (!formData.firstName || !formData.lastName || !formData.teamId || !formData.dni || !formData.birthDate) {
        setFormError({
          title: "Faltan datos",
          description: "Completá nombre, apellido, DNI, fecha de nacimiento y equipo.",
        })
        return
      }

      const payload = {
        teamId: formData.teamId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        dni: formData.dni,
        birthDate: formData.birthDate,
        jerseyNumber,
        heightCm: null,
        isFederated: formData.isFederated,
        federatedCategory: formData.isFederated ? formData.federatedCategory : null,
        labasSeasons,
        photoUrl: null,
      }

      const isEditing = Boolean(editingPlayer?.id)
      const url = isEditing ? `/api/admin/players/${editingPlayer!.id}` : "/api/admin/players"
      const method = isEditing ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        const parsed = parsePlayerSubmitError(json?.error ?? "No se pudo guardar el jugador")
        setFormError(parsed)
        return
      }

      const saved = mapPlayerFromDb(json.player)
      if (isEditing) {
        setPlayers((prev) => prev.map((p) => (p.id === editingPlayer!.id ? saved : p)))
      } else {
        setPlayers((prev) => [saved, ...prev])
      }

      setIsOpen(false)
      setEditingPlayer(null)
      setFormError(null)
      resetForm()
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      dni: "",
      birthDate: "",
      jerseyNumber: 0,
      teamId: "",
      isFederated: true,
      federatedCategory: "mayores",
      labasSeasons: 0,
    })
    setJerseyNumberInput("0")
    setLabasSeasonsInput("0")
    setTeamInput("")
  }

  const openEdit = (player: PlayerRow) => {
    setEditingPlayer(player)
    setFormError(null)
    setFormData({
      firstName: player.firstName,
      lastName: player.lastName,
      dni: player.dni,
      birthDate: formatDateOnly(player.birthDate),
      jerseyNumber: player.jerseyNumber,
      teamId: player.teamId,
      isFederated: player.isFederated,
      federatedCategory: player.federatedCategory ?? "mayores",
      labasSeasons: player.labasSeasons ?? 0,
    })
    setJerseyNumberInput(String(player.jerseyNumber))
    setLabasSeasonsInput(String(player.labasSeasons ?? 0))
    setTeamInput(teamIdToLabel[player.teamId] ?? "")
    setIsOpen(true)
  }

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "N/A"

  const calculateAge = (birthDate: Date) => {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const filteredPlayers = (() => {
    const q = search.trim().toLowerCase()
    return (filterTeam === "all" ? players : players.filter((p) => p.teamId === filterTeam))
      .filter((p) => {
        if (filterFederated === "all") return true
        return filterFederated === "federated" ? p.isFederated : !p.isFederated
      })
      .filter((p) => {
        if (!q) return true
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase()
        return fullName.includes(q) || p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) || p.dni.toLowerCase().includes(q)
      })
      .sort((a, b) => a.jerseyNumber - b.jerseyNumber)
  })()

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión para eliminar jugadores.")
        return
      }

      const res = await fetch(`/api/admin/players/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo eliminar el jugador")
        return
      }

      setPlayers((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Jugadores" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Jugadores</h1>
          <p className="text-muted-foreground mt-1">Administra el plantel de cada equipo.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filterTeam} onValueChange={setFilterTeam}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por equipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los equipos</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Jugador
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingPlayer ? "Editar Jugador" : "Agregar Nuevo Jugador"}</DialogTitle>
                <DialogDescription>
                  {editingPlayer ? "Modifica los datos del jugador." : "Completa los datos del nuevo jugador."}
                </DialogDescription>
              </DialogHeader>
              {formError && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>{formError.title}</AlertTitle>
                  {formError.description ? <AlertDescription>{formError.description}</AlertDescription> : null}
                </Alert>
              )}
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="firstName">Nombre</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lastName">Apellido</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dni">DNI</Label>
                    <Input
                      id="dni"
                      value={formData.dni}
                      onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="birthDate">Fecha de Nacimiento</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="team">Equipo</Label>
                  <AutocompleteInput
                    id="team"
                    value={teamInput}
                    onValueChange={(value) => {
                      setTeamInput(value)
                      const resolved = teamLabelToId[value]
                      setFormData((prev) => ({
                        ...prev,
                        teamId: resolved ?? "",
                      }))
                    }}
                    options={teamOptions}
                    placeholder="Escribí para buscar equipo"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="jerseyNumber">Número de Camiseta</Label>
                    <Input
                      id="jerseyNumber"
                      type="number"
                      min="0"
                      max="99"
                      value={jerseyNumberInput}
                      onChange={(e) => {
                        setJerseyNumberInput(e.target.value)
                        const n = Number.parseInt(e.target.value, 10)
                        if (Number.isFinite(n) && n >= 0 && n <= 99) {
                          setFormData((prev) => ({ ...prev, jerseyNumber: n }))
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="isFederated">Jugador Federado</Label>
                    <Switch
                      id="isFederated"
                      checked={formData.isFederated}
                      onCheckedChange={(checked) => setFormData({ ...formData, isFederated: checked })}
                    />
                  </div>
                </div>
                {formData.isFederated ? (
                  <div className="grid gap-2">
                    <Label htmlFor="federatedCategory">Categoría federada</Label>
                    <Select
                      value={formData.federatedCategory}
                      onValueChange={(v) => setFormData({ ...formData, federatedCategory: v as "mayores" | "intermedia" })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mayores">Mayores (400)</SelectItem>
                        <SelectItem value="intermedia">Intermedia (200)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <Label htmlFor="labasSeasons">Trayectoria LaBas (temporadas)</Label>
                  <Input
                    id="labasSeasons"
                    type="number"
                    min="0"
                    value={labasSeasonsInput}
                    onChange={(e) => {
                      setLabasSeasonsInput(e.target.value)
                      const n = Number.parseInt(e.target.value, 10)
                      if (Number.isFinite(n) && n >= 0) {
                        setFormData((prev) => ({ ...prev, labasSeasons: n }))
                      }
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    !formData.firstName ||
                    !formData.lastName ||
                    !formData.teamId ||
                    !formData.dni ||
                    !formData.birthDate
                  }
                >
                  {submitting ? "Guardando..." : editingPlayer ? "Guardar Cambios" : "Agregar Jugador"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <Label htmlFor="player-search">Buscar</Label>
              <Input
                id="player-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, apellido o DNI"
              />
            </div>

            <div>
              <Label>Federado</Label>
              <Select value={filterFederated} onValueChange={(v) => setFilterFederated(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="federated">Federados</SelectItem>
                  <SelectItem value="not_federated">No federados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando jugadores...</CardContent>
        </Card>
      ) : filteredPlayers.length === 0 ? (
        <EmptyState
          icon={UserCircle}
          title="No hay jugadores"
          description={
            filterTeam === "all"
              ? "Agrega jugadores para completar los planteles."
              : "Este equipo no tiene jugadores registrados."
          }
          action={{ label: "Agregar Jugador", onClick: () => setIsOpen(true) }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead>Jugador</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Edad</TableHead>
                  <TableHead>Scoring</TableHead>
                  <TableHead className="text-center">Federado</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell className="font-bold text-lg">{player.jerseyNumber}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {player.firstName} {player.lastName}
                      </div>
                      <div className="text-sm text-muted-foreground">DNI: {player.dni}</div>
                    </TableCell>
                    <TableCell>{getTeamName(player.teamId)}</TableCell>
                    <TableCell>{calculateAge(player.birthDate)} años</TableCell>
                    <TableCell>{player.scoring}</TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          player.isFederated
                            ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {player.isFederated ? "Federado" : "No federado"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Opciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(player)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(player)} className="text-destructive">
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar jugador</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmás eliminar al jugador <strong>{deleteTarget?.firstName} {deleteTarget?.lastName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={submitting}>
              {submitting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type TeamOption = {
  id: string
  name: string
}

type PlayerRow = {
  id: string
  teamId: string
  firstName: string
  lastName: string
  dni: string
  birthDate: Date
  jerseyNumber: number
  heightCm?: number | null
  isFederated: boolean
  federatedCategory?: "mayores" | "intermedia" | null
  labasSeasons?: number | null
  scoring: number
  photoUrl?: string | null
  createdAt?: string
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map((n) => Number.parseInt(n, 10))
  if (!y || !m || !d) return new Date(value)
  return new Date(y, m - 1, d)
}

function formatDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function mapPlayerFromDb(row: any): PlayerRow {
  return {
    id: row.id,
    teamId: row.team_id,
    firstName: row.first_name,
    lastName: row.last_name,
    dni: row.dni,
    birthDate: parseDateOnly(row.birth_date),
    jerseyNumber: row.jersey_number,
    heightCm: row.height_cm ?? null,
    isFederated: row.is_federated,
    federatedCategory: (row.federated_category as "mayores" | "intermedia" | null) ?? null,
    labasSeasons: typeof row.labas_seasons === "number" ? row.labas_seasons : null,
    scoring: typeof row.scoring === "number" ? row.scoring : 0,
    photoUrl: row.photo_url ?? null,
    createdAt: row.created_at,
  }
}

function parsePlayerSubmitError(message: string): { title: string; description?: string } {
  const msg = String(message || "").trim()
  const lower = msg.toLowerCase()

  if (lower.includes("players_team_id_jersey_number_key") || (lower.includes("team") && lower.includes("jersey"))) {
    return {
      title: "Número de camiseta duplicado",
      description: "Ya existe un jugador con ese número de camiseta en este equipo.",
    }
  }

  if (lower.includes("players_dni_key") || lower.includes("unique") && lower.includes("dni")) {
    return {
      title: "DNI duplicado",
      description: "Ya existe un jugador registrado con ese DNI.",
    }
  }

  if (lower.includes("no autorizado") || lower.includes("unauthorized")) {
    return {
      title: "No autorizado",
      description: "Tu sesión no tiene permisos para crear/editar jugadores.",
    }
  }

  if (lower.includes("foreign key") && lower.includes("team")) {
    return {
      title: "Equipo inválido",
      description: "El equipo seleccionado no existe o no está disponible.",
    }
  }

  return {
    title: "No se pudo guardar el jugador",
    description: msg || "Ocurrió un error inesperado.",
  }
}
