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
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Plus, Layers, Edit, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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

export default function CategoriasPage() {
  const [isOpen, setIsOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterBranch, setFilterBranch] = useState<"all" | Branch>("all")

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return categories.filter((t) => {
      if (filterBranch !== "all" && t.branch !== filterBranch) return false
      if (!q) return true
      return t.name.toLowerCase().includes(q) || t.age_group.toLowerCase().includes(q)
    })
  }, [categories, search, filterBranch])

  const categorySearchOptions = useMemo(() => {
    const names = categories.map((t) => t.name)
    const ages = categories.map((t) => t.age_group)
    return Array.from(new Set([...names, ...ages].filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [categories])

  const [formData, setFormData] = useState({
    name: "",
    branch: "masculino" as Branch,
    ageGroup: "",
    scoringCap: "",
    federatedU21Limit: "",
    federatedU23Limit: "",
    federatedPrimeraLimit: "",
    federatedSegundaLimit: "",
  })

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const [{ data: categoriesData, error: categoriesError }, { data: linkRows, error: linkError }] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, age_group, branch, scoring_cap, federated_u21_limit, federated_u23_limit, federated_primera_limit, federated_segunda_limit, created_at")
          .order("created_at", { ascending: true }),
        supabase.from("team_categories").select("category_id").order("created_at", { ascending: true }),
      ])

      if (categoriesError) {
        setError(categoriesError.message)
        setCategories([])
        setLoading(false)
        return
      }

      if (linkError) {
        setError(linkError.message)
      }

      setCategories((categoriesData ?? []) as Category[])

      const counts: Record<string, number> = {}
      ;(linkRows ?? []).forEach((row: any) => {
        const cid = row.category_id as string | undefined
        if (!cid) return
        counts[cid] = (counts[cid] ?? 0) + 1
      })
      setTeamCounts(counts)

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
        setError("Tenés que iniciar sesión para gestionar categorías.")
        return
      }

      if (!formData.name || !formData.ageGroup) {
        setError("Completá nombre y grupo de edad.")
        return
      }
      const limitFields = ["federatedU21Limit", "federatedU23Limit", "federatedPrimeraLimit", "federatedSegundaLimit"] as const
      if (limitFields.some((field) => formData[field] !== "" &&
        (!Number.isSafeInteger(Number(formData[field])) || Number(formData[field]) < 0))) {
        setError("Los límites de federados deben ser enteros no negativos o quedar vacíos.")
        return
      }

      const isEditing = Boolean(editingCategory?.id)
      const url = isEditing ? `/api/admin/categories/${editingCategory!.id}` : "/api/admin/categories"
      const method = isEditing ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          ageGroup: formData.ageGroup,
          branch: formData.branch,
          scoringCap: formData.scoringCap ? Number(formData.scoringCap) : null,
          federatedU21Limit: formData.federatedU21Limit === "" ? null : Number(formData.federatedU21Limit),
          federatedU23Limit: formData.federatedU23Limit === "" ? null : Number(formData.federatedU23Limit),
          federatedPrimeraLimit: formData.federatedPrimeraLimit === "" ? null : Number(formData.federatedPrimeraLimit),
          federatedSegundaLimit: formData.federatedSegundaLimit === "" ? null : Number(formData.federatedSegundaLimit),
        }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo guardar la categoría")
        return
      }

      const saved = mapCategoryFromApi(isEditing ? json.category : json.category)
      if (isEditing) {
        setCategories((prev) => prev.map((t) => (t.id === editingCategory!.id ? saved : t)))
      } else {
        setCategories((prev) => [...prev, saved])
      }

      setIsOpen(false)
      setEditingCategory(null)
      resetForm()
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      branch: "masculino",
      ageGroup: "",
      scoringCap: "",
      federatedU21Limit: "",
      federatedU23Limit: "",
      federatedPrimeraLimit: "",
      federatedSegundaLimit: "",
    })
  }

  const openEdit = (category: Category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      branch: category.branch,
      ageGroup: category.age_group,
      scoringCap: category.scoring_cap != null ? String(category.scoring_cap) : "",
      federatedU21Limit: category.federated_u21_limit != null ? String(category.federated_u21_limit) : "",
      federatedU23Limit: category.federated_u23_limit != null ? String(category.federated_u23_limit) : "",
      federatedPrimeraLimit: category.federated_primera_limit != null ? String(category.federated_primera_limit) : "",
      federatedSegundaLimit: category.federated_segunda_limit != null ? String(category.federated_segunda_limit) : "",
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
        setError("Tenés que iniciar sesión para eliminar categorías.")
        return
      }

      const res = await fetch(`/api/admin/categories/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo eliminar la categoría")
        return
      }

      setCategories((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Categorías" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Categorías</h1>
          <p className="text-muted-foreground mt-1">Crea el catálogo de categorías disponibles para los torneos.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Categoría
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCategory ? "Editar Categoría" : "Crear Nueva Categoría"}</DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? "Modifica los datos de la categoría."
                  : "Completa los datos para crear una nueva categoría."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre de la Categoría</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: U15"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ageGroup">Grupo de Edad</Label>
                <Input
                  id="ageGroup"
                  value={formData.ageGroup}
                  onChange={(e) => setFormData({ ...formData, ageGroup: e.target.value })}
                  placeholder="Ej: U15, U17, Primera"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scoringCap">Límite de Scoring (opcional)</Label>
                <Input
                  id="scoringCap"
                  type="number"
                  min={0}
                  value={formData.scoringCap}
                  onChange={(e) => setFormData({ ...formData, scoringCap: e.target.value })}
                  placeholder="Ej: 500"
                />
              </div>
              <p className="text-sm text-muted-foreground">Máximo de federados por equipo (vacío = sin límite)</p>
              {([
                ["federatedU21Limit", "U21"],
                ["federatedU23Limit", "U23"],
                ["federatedPrimeraLimit", "Primera"],
                ["federatedSegundaLimit", "Segunda"],
              ] as const).map(([field, label]) => (
                <div className="grid gap-2" key={field}>
                  <Label htmlFor={field}>Federados {label}</Label>
                  <Input
                    id={field}
                    type="number"
                    min={0}
                    step={1}
                    value={formData[field]}
                    onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                    placeholder="Sin límite"
                  />
                </div>
              ))}
              <div className="grid gap-2">
                <Label htmlFor="branch">Rama</Label>
                <Select value={formData.branch} onValueChange={(value: Branch) => setFormData({ ...formData, branch: value })}>
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

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !formData.name || !formData.ageGroup}>
                {editingCategory ? "Guardar Cambios" : "Crear Categoría"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <Label htmlFor="cat-search">Buscar</Label>
              <AutocompleteInput
                id="cat-search"
                value={search}
                onValueChange={setSearch}
                options={categorySearchOptions}
                placeholder="Buscar por nombre o grupo de edad"
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
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Cargando categorías...</CardContent>
        </Card>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No hay categorías"
          description={categories.length === 0 ? "Crea tu primera categoría para poder asignar equipos." : "No hay resultados con los filtros aplicados."}
          action={{ label: "Crear Categoría", onClick: () => setIsOpen(true) }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Grupo de Edad</TableHead>
                  <TableHead>Rama</TableHead>
                  <TableHead className="text-center">Equipos</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>{category.age_group}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                        {category.branch === "masculino"
                          ? "Masculino"
                          : category.branch === "femenino"
                            ? "Femenino"
                            : "Mixto"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{teamCounts[category.id] ?? 0}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Opciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(category)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(category)} className="text-destructive">
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

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmás eliminar la categoría <strong>{deleteTarget?.name}</strong>?
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
  age_group: string
  branch: Branch
  scoring_cap: number | null
  federated_u21_limit: number | null
  federated_u23_limit: number | null
  federated_primera_limit: number | null
  federated_segunda_limit: number | null
  created_at: string
}

function mapCategoryFromApi(category: any): Category {
  return {
    id: category.id,
    name: category.name,
    age_group: category.age_group,
    branch: category.branch,
    scoring_cap: category.scoring_cap ?? null,
    federated_u21_limit: category.federated_u21_limit ?? null,
    federated_u23_limit: category.federated_u23_limit ?? null,
    federated_primera_limit: category.federated_primera_limit ?? null,
    federated_segunda_limit: category.federated_segunda_limit ?? null,
    created_at: category.created_at,
  }
}
