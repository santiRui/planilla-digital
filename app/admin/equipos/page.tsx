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
import { Plus, Users, Edit, MoreHorizontal, UserCircle, Printer } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { Branch } from "@/lib/types"
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

export default function EquiposPage() {
  const [isOpen, setIsOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [search, setSearch] = useState("")
  const [filterBranch, setFilterBranch] = useState<"all" | Branch>("all")
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [teamPlayerCounts, setTeamPlayerCounts] = useState<Record<string, number>>({})
  const [teamScoring, setTeamScoring] = useState<Record<string, number>>({})
  const [playersByTeamId, setPlayersByTeamId] = useState<Record<string, TeamPlayerRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    logoUrl: "",
    primaryColor: "#1e3a5f",
    secondaryColor: "#f59e0b",
  })

  const [logoFile, setLogoFile] = useState<File | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const [
        { data: categoriesData, error: categoriesError },
        { data: teamsData, error: teamsError },
        { data: teamCategoryRows, error: teamCategoryError },
      ] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, branch, age_group, scoring_cap")
          .order("created_at", { ascending: true }),
        supabase
          .from("teams")
          .select("id, name, logo_url, primary_color, secondary_color, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("team_categories").select("team_id, category_id").order("created_at", { ascending: true }),
      ])

      if (categoriesError) setError(categoriesError.message)
      if (teamsError) setError(teamsError.message)
      if (teamCategoryError) setError(teamCategoryError.message)

      setCategories(
        (categoriesData ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          branch: c.branch,
          ageGroup: c.age_group,
          scoringCap: typeof c.scoring_cap === "number" ? c.scoring_cap : null,
        })) as Category[],
      )

      const categoryIdsByTeamId: Record<string, string[]> = {}
      ;(teamCategoryRows ?? []).forEach((r: any) => {
        const teamId = r.team_id as string | undefined
        const categoryId = r.category_id as string | undefined
        if (!teamId || !categoryId) return
        if (!categoryIdsByTeamId[teamId]) categoryIdsByTeamId[teamId] = []
        categoryIdsByTeamId[teamId]!.push(categoryId)
      })

      setTeams(
        (teamsData ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          categoryIds: categoryIdsByTeamId[t.id] ?? [],
          categoryId: (categoryIdsByTeamId[t.id] ?? [""])[0] ?? "",
          logoUrl: t.logo_url ?? "",
          primaryColor: t.primary_color,
          secondaryColor: t.secondary_color,
          createdAt: t.created_at,
        })) as Team[],
      )

      const counts: Record<string, number> = {}
      const scoringByTeam: Record<string, number> = {}
      const playersMap: Record<string, TeamPlayerRow[]> = {}
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (token) {
        const res = await fetch("/api/admin/players", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const json = (await res.json().catch(() => null)) as any
        if (!res.ok) {
          setError(json?.error ?? "No se pudieron cargar los jugadores")
        } else {
          ;(json.players ?? []).forEach((p: any) => {
            const teamId = p.team_id as string | undefined
            if (!teamId) return
            counts[teamId] = (counts[teamId] ?? 0) + 1
            const playerScoring = typeof p.scoring === "number" ? p.scoring : 0
            scoringByTeam[teamId] = (scoringByTeam[teamId] ?? 0) + playerScoring

            if (!playersMap[teamId]) playersMap[teamId] = []
            playersMap[teamId]!.push({
              teamId,
              jerseyNumber: (p.jersey_number as number | null) ?? null,
              firstName: String(p.first_name ?? ""),
              lastName: String(p.last_name ?? ""),
              dni: String(p.dni ?? ""),
              birthDate: (p.birth_date as string | null) ?? null,
            })
          })
        }
      }
      setTeamPlayerCounts(counts)
      setTeamScoring(scoringByTeam)
      setPlayersByTeamId(playersMap)
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
        setError("Tenés que iniciar sesión para gestionar equipos.")
        return
      }

      if (!formData.name || !formData.categoryId) {
        setError("Completá nombre y categoría.")
        return
      }

      if (exceedsScoringCap) {
        setError("Este equipo supera el límite de scoring de la categoría seleccionada.")
        return
      }

      let finalLogoUrl: string | null = formData.logoUrl ? formData.logoUrl : null

      if (logoFile) {
        const ext = logoFile.name.includes(".") ? logoFile.name.split(".").pop() : "png"
        const safeExt = ext ? ext.toLowerCase() : "png"
        const path = `uploads/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`

        const upload = await supabase.storage.from("team-logos").upload(path, logoFile, {
          upsert: true,
          contentType: logoFile.type || undefined,
        })

        if (upload.error) {
          setError(upload.error.message)
          return
        }

        const { data: publicUrlData } = supabase.storage.from("team-logos").getPublicUrl(path)
        finalLogoUrl = publicUrlData.publicUrl
      }

      const payload = {
        name: formData.name,
        categoryId: formData.categoryId,
        logoUrl: finalLogoUrl,
        primaryColor: formData.primaryColor,
        secondaryColor: formData.secondaryColor,
      }

      const isEditing = Boolean(editingTeam?.id)
      const url = isEditing ? `/api/admin/teams/${editingTeam!.id}` : "/api/admin/teams"
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
        setError(json?.error ?? "No se pudo guardar el equipo")
        return
      }

      const saved = mapTeamFromApi(json.team)
      if (isEditing) {
        setTeams((prev) => prev.map((t) => (t.id === editingTeam!.id ? saved : t)))
      } else {
        setTeams((prev) => [saved, ...prev])
      }

      setIsOpen(false)
      setEditingTeam(null)
      resetForm()
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      categoryId: "",
      logoUrl: "",
      primaryColor: "#1e3a5f",
      secondaryColor: "#f59e0b",
    })
    setLogoFile(null)
  }

  const openEdit = (team: Team) => {
    setEditingTeam(team)
    setFormData({
      name: team.name,
      categoryId: team.categoryId,
      logoUrl: team.logoUrl ?? "",
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
    })
    setLogoFile(null)
    setIsOpen(true)
  }

  const getCategoryName = (id: string) => {
    const category = categories.find((c) => c.id === id)
    if (!category) return "N/A"
    return `${category.name}${category.ageGroup ? ` (${category.ageGroup})` : ""}`
  }
  const getPlayerCount = (teamId: string) => teamPlayerCounts[teamId] ?? 0
  const getTeamScoring = (teamId: string) => teamScoring[teamId] ?? 0

  const csvEscape = (value: string | number | null | undefined) => {
    const s = String(value ?? "")
    if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const formatBirthDate = (raw: string | null) => {
    if (!raw) return ""
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return raw
    return d.toLocaleDateString("es-AR")
  }

  const downloadRosterCsv = async (team: Team) => {
    const rows = (playersByTeamId[team.id] ?? []).slice().sort((a, b) => {
      const an = a.jerseyNumber ?? 999
      const bn = b.jerseyNumber ?? 999
      return an - bn
    })

    const lines: string[] = []
    lines.push(`Equipo;${csvEscape(team.name)}`)
    lines.push("")
    lines.push("NRO CAMISETA;NOMBRE;APELLIDO;DNI;FECHA DE NACIMIENTO")
    for (const p of rows) {
      lines.push(
        [
          csvEscape(p.jerseyNumber ?? ""),
          csvEscape(p.firstName),
          csvEscape(p.lastName),
          csvEscape(p.dni),
          csvEscape(formatBirthDate(p.birthDate)),
        ].join(";"),
      )
    }

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const safeName = team.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "equipo"
    a.download = `planilla-${safeName}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const categoryById = useMemo(() => {
    return Object.fromEntries(categories.map((c) => [c.id, c])) as Record<string, Category>
  }, [categories])

  const selectedCategory = categories.find((c) => c.id === formData.categoryId) || null
  const currentTeamScoring = editingTeam ? getTeamScoring(editingTeam.id) : 0
  const exceedsScoringCap =
    !!selectedCategory && typeof selectedCategory.scoringCap === "number" && selectedCategory.scoringCap >= 0
      ? currentTeamScoring > selectedCategory.scoringCap
      : false

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase()
    return teams.filter((t) => {
      const branch = categoryById[t.categoryId]?.branch
      if (filterBranch !== "all" && branch !== filterBranch) return false
      if (!q) return true
      return t.name.toLowerCase().includes(q)
    })
  }, [teams, search, filterBranch, categoryById])

  const teamNameOptions = useMemo(() => {
    return Array.from(new Set(teams.map((t) => t.name).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [teams])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión para eliminar equipos.")
        return
      }

      const res = await fetch(`/api/admin/teams/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo eliminar el equipo")
        return
      }

      setTeams((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Equipos" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Equipos</h1>
          <p className="text-muted-foreground mt-1">Administra los equipos participantes.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Equipo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingTeam ? "Editar Equipo" : "Crear Nuevo Equipo"}</DialogTitle>
                <DialogDescription>
                  {editingTeam ? "Modifica los datos del equipo." : "Completa los datos para crear un nuevo equipo."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nombre del Equipo</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Halcones del Norte"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Categoría</Label>
                  <Select
                    value={formData.categoryId}
                    onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                          {category.ageGroup ? ` (${category.ageGroup})` : ""}
                          {typeof category.scoringCap === "number" && ` (límite: ${category.scoringCap})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {editingTeam &&
                    selectedCategory &&
                    typeof selectedCategory.scoringCap === "number" &&
                    selectedCategory.scoringCap >= 0 && (
                      <p className={exceedsScoringCap ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                        Este equipo tiene un scoring de {currentTeamScoring} y el límite de la categoría es {" "}
                        {selectedCategory.scoringCap}.
                        {exceedsScoringCap && " No vas a poder guardar mientras supere ese límite."}
                      </p>
                    )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="logoUrl">Logo (URL)</Label>
                  <Input
                    id="logoUrl"
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="logoFile">Logo (archivo)</Label>
                  <Input
                    id="logoFile"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="primaryColor">Color Principal</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primaryColor"
                        type="color"
                        value={formData.primaryColor}
                        onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                        className="w-14 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={formData.primaryColor}
                        onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="secondaryColor">Color Secundario</Label>
                    <div className="flex gap-2">
                      <Input
                        id="secondaryColor"
                        type="color"
                        value={formData.secondaryColor}
                        onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                        className="w-14 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={formData.secondaryColor}
                        onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
                {error && (
                  <p className="text-sm text-destructive mt-2">
                    {error}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || !formData.name || !formData.categoryId}>
                  {editingTeam ? "Guardar Cambios" : "Crear Equipo"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <Label htmlFor="team-search">Buscar</Label>
              <AutocompleteInput
                id="team-search"
                value={search}
                onValueChange={setSearch}
                options={teamNameOptions}
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
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="femenino">Femenino</SelectItem>
                  <SelectItem value="mixto">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando equipos...</CardContent>
        </Card>
      ) : filteredTeams.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay equipos"
          description={
            teams.length === 0 ? "Crea tu primer equipo para comenzar." : "No hay resultados con los filtros aplicados."
          }
          action={{ label: "Crear Equipo", onClick: () => setIsOpen(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTeams.map((team) => (
            <Card key={team.id} className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: team.primaryColor }} />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {team.logoUrl ? (
                      <div
                        className="h-12 w-12 rounded-full overflow-hidden border bg-muted flex items-center justify-center"
                        style={{ borderColor: team.primaryColor }}
                      >
                        <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div
                        className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: team.primaryColor }}
                      >
                        {team.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg">{team.name}</CardTitle>
                      <CardDescription>{getCategoryName(team.categoryId)}</CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Opciones</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => downloadRosterCsv(team)}>
                        <Printer className="mr-2 h-4 w-4" />
                        Descargar planilla
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(team)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteTarget(team)} className="text-destructive">
                        Eliminar
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/jugadores?equipo=${team.id}`}>
                          <UserCircle className="mr-2 h-4 w-4" />
                          Ver Jugadores
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{team.logoUrl ? "Con logo" : "Sin logo"}</span>
                  <div className="flex flex-col items-end gap-1 text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span>Scoring:</span>
                      <span className="font-medium">{getTeamScoring(team.id)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <UserCircle className="h-4 w-4" />
                      <span>{getPlayerCount(team.id)} jugadores</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar equipo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmás eliminar el equipo <strong>{deleteTarget?.name}</strong>?
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

type Category = {
  id: string
  name: string
  branch: Branch
  ageGroup: string
  scoringCap: number | null
}

type TeamPlayerRow = {
  teamId: string
  jerseyNumber: number | null
  firstName: string
  lastName: string
  dni: string
  birthDate: string | null
}

type Team = {
  id: string
  name: string
  categoryId: string
  categoryIds: string[]
  logoUrl?: string
  primaryColor: string
  secondaryColor: string
  createdAt?: string
}

function mapTeamFromApi(team: any): Team {
  const categoryIds = Array.isArray(team.categoryIds)
    ? (team.categoryIds as string[])
    : team.category_id
      ? [team.category_id]
      : []

  return {
    id: team.id,
    name: team.name,
    categoryIds,
    categoryId: categoryIds[0] ?? "",
    logoUrl: team.logo_url ?? "",
    primaryColor: team.primary_color,
    secondaryColor: team.secondary_color,
    createdAt: team.created_at,
  }
}
