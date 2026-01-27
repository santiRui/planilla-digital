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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Plus, ClipboardList, Edit, MoreHorizontal, Phone, Mail, AlertCircle } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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

export default function TecnicosPage() {
  const [isOpen, setIsOpen] = useState(false)
  const [editingCoach, setEditingCoach] = useState<StaffRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null)
  const [filterTeam, setFilterTeam] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [filterRole, setFilterRole] = useState<"all" | StaffRole>("all")
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [teamInput, setTeamInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<{ title: string; description?: string } | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    role: "tecnico" as StaffRole,
    teamId: "",
    phone: "",
    email: "",
  })

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
      map[teamLabelFor(t)] = t.id
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
      const [{ data: teamsData, error: teamsError }, session] = await Promise.all([
        supabase.from("teams").select("id, name").order("created_at", { ascending: true }),
        supabase.auth.getSession(),
      ])

      if (teamsError) setError(teamsError.message)
      setTeams((teamsData ?? []) as TeamOption[])

      const token = session.data.session?.access_token
      if (!token) {
        setStaff([])
        setError((prev) => prev ?? "Tenés que iniciar sesión para ver el cuerpo técnico.")
        setLoading(false)
        return
      }

      const res = await fetch("/api/admin/coaching-staff", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setStaff([])
        setError(json?.error ?? "No se pudo cargar el cuerpo técnico")
        setLoading(false)
        return
      }

      setStaff((json.staff ?? []).map(mapStaffFromDb) as StaffRow[])
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
        setFormError({ title: "No autorizado", description: "Tenés que iniciar sesión para gestionar el cuerpo técnico." })
        return
      }

      if (!formData.firstName || !formData.lastName || !formData.teamId || !formData.role) {
        setFormError({ title: "Faltan datos", description: "Completá nombre, apellido, rol y equipo." })
        return
      }

      if (formData.email && formData.email.trim().length > 0) {
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())
        if (!isValidEmail) {
          setFormError({ title: "Email inválido", description: "Ingresá un email válido o dejalo vacío." })
          return
        }
      }

      const payload = {
        teamId: formData.teamId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        phone: formData.phone ? formData.phone : null,
        email: formData.email ? formData.email : null,
      }

      const isEditing = Boolean(editingCoach?.id)
      const url = isEditing ? `/api/admin/coaching-staff/${editingCoach!.id}` : "/api/admin/coaching-staff"
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
        setFormError(parseStaffSubmitError(json?.error ?? "No se pudo guardar"))
        return
      }

      const saved = mapStaffFromDb(json.staff)
      if (isEditing) {
        setStaff((prev) => prev.map((c) => (c.id === editingCoach!.id ? saved : c)))
      } else {
        setStaff((prev) => [saved, ...prev])
      }

      setIsOpen(false)
      setEditingCoach(null)
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
      role: "tecnico",
      teamId: "",
      phone: "",
      email: "",
    })
    setTeamInput("")
  }

  const openEdit = (coach: StaffRow) => {
    setEditingCoach(coach)
    setFormError(null)
    setFormData({
      firstName: coach.firstName,
      lastName: coach.lastName,
      role: coach.role,
      teamId: coach.teamId,
      phone: coach.phone || "",
      email: coach.email || "",
    })
    setTeamInput(teamIdToLabel[coach.teamId] ?? "")
    setIsOpen(true)
  }

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name || "N/A"

  const filteredStaff = (() => {
    const q = search.trim().toLowerCase()
    return (filterTeam === "all" ? staff : staff.filter((c) => c.teamId === filterTeam))
      .filter((c) => {
        if (filterRole === "all") return true
        return c.role === filterRole
      })
      .filter((c) => {
        if (!q) return true
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
        const email = (c.email ?? "").toLowerCase()
        const phone = (c.phone ?? "").toLowerCase()
        return fullName.includes(q) || email.includes(q) || phone.includes(q)
      })
      .sort((a, b) => {
        const ln = a.lastName.localeCompare(b.lastName)
        if (ln !== 0) return ln
        return a.firstName.localeCompare(b.firstName)
      })
  })()

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión para eliminar.")
        return
      }

      const res = await fetch(`/api/admin/coaching-staff/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo eliminar")
        return
      }

      setStaff((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Cuerpo Técnico" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cuerpo Técnico</h1>
          <p className="text-muted-foreground mt-1">Administra técnicos y asistentes de cada equipo.</p>
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
              <Button
                onClick={() => {
                  setEditingCoach(null)
                  setFormError(null)
                  resetForm()
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCoach ? "Editar Técnico" : "Agregar Técnico/Asistente"}</DialogTitle>
                <DialogDescription>
                  {editingCoach ? "Modifica los datos." : "Completa los datos del nuevo miembro del cuerpo técnico."}
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
                  <div className="grid gap-2">
                    <Label htmlFor="role">Rol</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value: StaffRole) => setFormData({ ...formData, role: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tecnico">Técnico Principal</SelectItem>
                        <SelectItem value="asistente">Asistente</SelectItem>
                        <SelectItem value="delegado">Delegado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !formData.firstName || !formData.lastName || !formData.teamId || !formData.role}
                >
                  {submitting ? "Guardando..." : editingCoach ? "Guardar Cambios" : "Agregar"}
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
              <Label htmlFor="staff-search">Buscar</Label>
              <Input
                id="staff-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono o email"
              />
            </div>

            <div>
              <Label>Rol</Label>
              <Select value={filterRole} onValueChange={(v) => setFilterRole(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="tecnico">Técnico</SelectItem>
                  <SelectItem value="asistente">Asistente</SelectItem>
                  <SelectItem value="delegado">Delegado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando cuerpo técnico...</CardContent>
        </Card>
      ) : filteredStaff.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No hay cuerpo técnico"
          description={
            filterTeam === "all"
              ? "Agrega técnicos y asistentes para los equipos."
              : "Este equipo no tiene cuerpo técnico registrado."
          }
          action={{ label: "Agregar", onClick: () => setIsOpen(true) }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((coach) => (
                  <TableRow key={coach.id}>
                    <TableCell className="font-medium">
                      {coach.firstName} {coach.lastName}
                    </TableCell>
                    <TableCell>{getTeamName(coach.teamId)}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          coach.role === "tecnico" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {coach.role === "tecnico" ? "Técnico Principal" : "Asistente"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {coach.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {coach.phone}
                          </div>
                        )}
                        {coach.email && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {coach.email}
                          </div>
                        )}
                        {!coach.phone && !coach.email && <span className="text-muted-foreground">-</span>}
                      </div>
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
                          <DropdownMenuItem onClick={() => openEdit(coach)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(coach)} className="text-destructive">
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
            <AlertDialogTitle>Eliminar</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmás eliminar a <strong>{deleteTarget?.firstName} {deleteTarget?.lastName}</strong>?
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

type StaffRole = "tecnico" | "asistente" | "delegado"

type TeamOption = {
  id: string
  name: string
}

type StaffRow = {
  id: string
  teamId: string
  firstName: string
  lastName: string
  role: StaffRole
  phone?: string | null
  email?: string | null
  createdAt?: string
}

function mapStaffFromDb(row: any): StaffRow {
  return {
    id: row.id,
    teamId: row.team_id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    phone: row.phone ?? null,
    email: row.email ?? null,
    createdAt: row.created_at,
  }
}

function parseStaffSubmitError(message: string): { title: string; description?: string } {
  const msg = String(message || "").trim()
  const lower = msg.toLowerCase()

  if (lower.includes("no autorizado") || lower.includes("unauthorized")) {
    return {
      title: "No autorizado",
      description: "Tu sesión no tiene permisos para gestionar el cuerpo técnico.",
    }
  }

  if (lower.includes("foreign key") && lower.includes("team")) {
    return {
      title: "Equipo inválido",
      description: "El equipo seleccionado no existe o no está disponible.",
    }
  }

  return {
    title: "No se pudo guardar",
    description: msg || "Ocurrió un error inesperado.",
  }
}
