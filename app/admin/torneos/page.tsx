"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Plus, Trophy, Edit, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import type { Branch } from "@/lib/types"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
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

export default function TorneosPage() {
  const [isOpen, setIsOpen] = useState(false)
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  const [search, setSearch] = useState("")
  const [filterBranch, setFilterBranch] = useState<"all" | Branch>("all")
  const [filterStatus, setFilterStatus] = useState<"all" | Tournament["status"]>("all")
  const [filterYear, setFilterYear] = useState<"all" | string>("all")

  const [formData, setFormData] = useState({
    name: "",
    year: new Date().getFullYear(),
    branch: "masculino" as Branch,
    categoryId: "",
    status: "activo" as Tournament["status"],
    isPublic: true,
  })

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(tournaments.map((t) => t.year))).sort((a, b) => b - a)
    return years
  }, [tournaments])

  const tournamentNameOptions = useMemo(() => {
    return Array.from(new Set(tournaments.map((t) => t.name).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [tournaments])

  const filteredTournaments = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tournaments.filter((t) => {
      if (filterBranch !== "all" && t.branch !== filterBranch) return false
      if (filterStatus !== "all" && t.status !== filterStatus) return false
      if (filterYear !== "all" && String(t.year) !== filterYear) return false
      if (!q) return true
      return t.name.toLowerCase().includes(q)
    })
  }, [tournaments, search, filterBranch, filterStatus, filterYear])

  const totals = useMemo(() => {
    return {
      total: tournaments.length,
      activos: tournaments.filter((t) => t.status === "activo").length,
      pendientes: tournaments.filter((t) => t.status === "pendiente").length,
      finalizados: tournaments.filter((t) => t.status === "finalizado").length,
    }
  }, [tournaments])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const [{ data, error }, { data: categoriesData, error: categoriesError }] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id, name, short_name, year, branch, status, is_public, created_at, category_id")
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name, branch, age_group").order("created_at", { ascending: true }),
      ])

      if (categoriesError) {
        setError(categoriesError.message)
      }

      if (error) {
        setError(error.message)
        setTournaments([])
        setLoading(false)
        return
      }

      setTournaments((data ?? []) as Tournament[])
      setCategories((categoriesData ?? []) as Category[])
      setLoading(false)
    }

    run()
  }, [supabase])

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión para crear un torneo.")
        return
      }

      if (!formData.name || !formData.categoryId) {
        setError("Completá nombre del torneo y seleccioná una categoría.")
        return
      }

      const isEditing = Boolean(editingTournament?.id)
      const url = isEditing ? `/api/admin/tournaments/${editingTournament!.id}` : "/api/admin/tournaments"
      const method = isEditing ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          year: formData.year,
          branch: formData.branch,
          status: formData.status,
          categoryId: formData.categoryId,
          isPublic: formData.isPublic,
        }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo crear el torneo")
        return
      }

      if (isEditing) {
        setTournaments((prev) => prev.map((t) => (t.id === editingTournament!.id ? (json.tournament as Tournament) : t)))
      } else {
        setTournaments((prev) => [json.tournament as Tournament, ...prev])
      }
      setIsOpen(false)
      setEditingTournament(null)
      setFormData({
        name: "",
        year: new Date().getFullYear(),
        branch: "masculino",
        categoryId: "",
        status: "activo",
        isPublic: true,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = (tournament: Tournament) => {
    setEditingTournament(tournament)
    setFormData({
      name: tournament.name,
      year: tournament.year,
      branch: tournament.branch,
      categoryId: (tournament as any).category_id ?? "",
      status: tournament.status,
      isPublic: tournament.is_public ?? true,
    })
    setIsOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión para eliminar un torneo.")
        return
      }

      const res = await fetch(`/api/admin/tournaments/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo eliminar el torneo")
        return
      }

      setTournaments((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setSubmitting(false)
    }
  }

  const statusColors: Record<Tournament["status"], string> = {
    activo: "bg-[var(--color-success)] text-[var(--color-success-foreground)]",
    pendiente: "bg-[var(--color-warning)] text-[var(--color-warning-foreground)]",
    finalizado: "bg-secondary text-secondary-foreground",
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Torneos" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Torneos</h1>
          <p className="text-muted-foreground mt-1">Crea y administra los torneos del sistema.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Torneo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTournament ? "Editar Torneo" : "Crear Nuevo Torneo"}</DialogTitle>
              <DialogDescription>
                {editingTournament
                  ? "Modifica los datos del torneo."
                  : "Completa los datos para crear un nuevo torneo."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre del Torneo</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Torneo Barrial 2024"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="year">Año</Label>
                  <Input
                    id="year"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: Number.parseInt(e.target.value) })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="branch">Rama</Label>
                  <Select
                    value={formData.branch}
                    onValueChange={(value: Branch) => setFormData({ ...formData, branch: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="femenino">Femenino</SelectItem>
                      <SelectItem value="mixto">Mixto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="categoryTemplate">Categoría</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c) => c.branch === formData.branch)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.age_group ? ` (${c.age_group})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Estado</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: Tournament["status"]) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 items-center">
                <Label htmlFor="isPublic">Visible al público</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="isPublic"
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                  />
                  <span className="text-sm text-muted-foreground">Mostrar este torneo en la vista pública</span>
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !formData.name || !formData.categoryId}
              >
                {submitting ? "Guardando..." : editingTournament ? "Guardar Cambios" : "Crear Torneo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total torneos</p>
            <p className="text-2xl font-bold">{totals.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Activos</p>
            <p className="text-2xl font-bold">{totals.activos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pendientes</p>
            <p className="text-2xl font-bold">{totals.pendientes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Finalizados</p>
            <p className="text-2xl font-bold">{totals.finalizados}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <Label htmlFor="t-search">Buscar</Label>
              <AutocompleteInput
                id="t-search"
                value={search}
                onValueChange={setSearch}
                options={tournamentNameOptions}
                placeholder="Buscar por nombre"
              />
            </div>

            <div>
              <Label>Rama</Label>
              <Select value={filterBranch} onValueChange={(v) => setFilterBranch(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="femenino">Femenino</SelectItem>
                  <SelectItem value="mixto">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Estado</Label>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Año</Label>
              <Select value={filterYear} onValueChange={(v) => setFilterYear(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando torneos...</CardContent>
        </Card>
      ) : filteredTournaments.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No hay torneos"
          description={tournaments.length === 0 ? "Crea tu primer torneo para comenzar a gestionar equipos y partidos." : "No hay resultados con los filtros aplicados."}
          action={{ label: "Crear Torneo", onClick: () => setIsOpen(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTournaments.map((tournament) => (
            <Card key={tournament.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{tournament.name}</CardTitle>
                    <CardDescription>
                      {tournament.branch === "masculino"
                        ? "Rama Masculina"
                        : tournament.branch === "femenino"
                          ? "Rama Femenina"
                          : "Mixto"}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Opciones</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(tournament)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteTarget(tournament)} className="text-destructive">
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{tournament.year}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[tournament.status]}`}
                  >
                    {tournament.status === "activo"
                      ? "Activo"
                      : tournament.status === "pendiente"
                        ? "Pendiente"
                        : "Finalizado"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar torneo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmás eliminar el torneo <strong>{deleteTarget?.name}</strong>? Esta acción eliminará también sus
              categorías asociadas.
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

type Tournament = {
  id: string
  name: string
  short_name: string | null
  year: number
  branch: Branch
  status: "activo" | "finalizado" | "pendiente"
  is_public?: boolean | null
  created_at: string
  category_id: string
}

type Category = {
  id: string
  name: string
  branch: Branch
  age_group: string
}
