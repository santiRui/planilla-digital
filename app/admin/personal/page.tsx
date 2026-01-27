"use client"

import { useEffect, useMemo, useState } from "react"
import { Breadcrumbs } from "@/components/breadcrumbs"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
import { EmptyState } from "@/components/ui/empty-state"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import { Checkbox } from "@/components/ui/checkbox"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { UserRole } from "@/lib/types"
import { Edit, MoreHorizontal, Plus, UserCircle } from "lucide-react"

export default function PersonalPage() {
  const [activeTab, setActiveTab] = useState<"arbitro" | "oficial_mesa">("arbitro")

  const [people, setPeople] = useState<PersonRow[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [editing, setEditing] = useState<PersonRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PersonRow | null>(null)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [formData, setFormData] = useState({
    fullName: "",
    isReferee: true,
    isTableOfficial: false,
    email: "",
    password: "",
    phone: "",
  })

  const refresh = async () => {
    setLoading(true)
    setError(null)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setPeople([])
      setError("Tenés que iniciar sesión para gestionar personal.")
      setLoading(false)
      return
    }

    const res = await fetch("/api/admin/personal", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    const json = (await res.json().catch(() => null)) as any

    if (!res.ok) {
      setPeople([])
      setError(json?.error ?? "No se pudo cargar el personal")
      setLoading(false)
      return
    }

    setPeople((json.people ?? []).map(mapPersonFromApi) as PersonRow[])
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [supabase])

  const roleFiltered = useMemo(() => {
    if (activeTab === "arbitro") return people.filter((p) => p.isReferee)
    return people.filter((p) => p.isTableOfficial)
  }, [people, activeTab])

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roleFiltered
    return roleFiltered.filter((p) => {
      return (
        p.fullName.toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q)
      )
    })
  }, [roleFiltered, search])

  const searchOptions = useMemo(() => {
    const names = roleFiltered.map((p) => p.fullName)
    const emails = roleFiltered.map((p) => p.email).filter(Boolean) as string[]
    return Array.from(new Set([...names, ...emails].filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [roleFiltered])

  const openCreate = () => {
    setEditing(null)
    setFormData({
      fullName: "",
      isReferee: activeTab === "arbitro",
      isTableOfficial: activeTab === "oficial_mesa",
      email: "",
      password: "",
      phone: "",
    })
    setError(null)
    setIsOpen(true)
  }

  const openEdit = (person: PersonRow) => {
    setEditing(person)
    setFormData({
      fullName: person.fullName,
      isReferee: person.isReferee,
      isTableOfficial: person.isTableOfficial,
      email: person.email ?? "",
      password: "",
      phone: person.phone ?? "",
    })
    setError(null)
    setIsOpen(true)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError("Tenés que iniciar sesión para gestionar personal.")
        return
      }

      const fullName = formData.fullName.trim()
      const phone = formData.phone.trim()

      if (!fullName) {
        setError("Completá el nombre.")
        return
      }

      const isReferee = Boolean(formData.isReferee)
      const isTableOfficial = Boolean(formData.isTableOfficial)

      if (!isReferee && !isTableOfficial) {
        setError("Seleccioná al menos un rol.")
        return
      }

      if (editing) {
        const res = await fetch(`/api/admin/personal/${editing.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName,
            isReferee,
            isTableOfficial,
            phone: phone || null,
          }),
        })

        const json = (await res.json().catch(() => null)) as any
        if (!res.ok) {
          setError(json?.error ?? "No se pudo guardar")
          return
        }

        const saved = mapPersonFromApi(json.person)
        setPeople((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
        setIsOpen(false)
        setEditing(null)
        return
      }

      const email = formData.email.trim()
      const password = formData.password

      if (!email) {
        setError("Completá el email.")
        return
      }

      if (!password || password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres.")
        return
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          password,
          fullName,
          isReferee,
          isTableOfficial,
          phone: phone || null,
        }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo crear")
        return
      }

      const created: PersonRow = {
        id: json.id,
        fullName: json.fullName,
        role: json.role,
        isReferee: Boolean(json.isReferee),
        isTableOfficial: Boolean(json.isTableOfficial),
        email: json.email ?? null,
        phone: json.phone ?? null,
      }

      setPeople((prev) => [...prev, created].sort((a, b) => a.fullName.localeCompare(b.fullName)))
      setIsOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return

    setSubmitting(true)
    setError(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError("Tenés que iniciar sesión para eliminar personal.")
        return
      }

      const res = await fetch(`/api/admin/personal/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo eliminar")
        return
      }

      setPeople((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setSubmitting(false)
    }
  }

  const referees = useMemo(() => people.filter((p) => p.isReferee), [people])
  const tableOfficials = useMemo(() => people.filter((p) => p.isTableOfficial), [people])

  const renderTable = (rows: PersonRow[]) => (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.fullName}</TableCell>
                <TableCell>{p.email ?? "-"}</TableCell>
                <TableCell>{p.phone ? p.phone : "-"}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Opciones</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(p)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(p)}>
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
  )

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Personal" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Personal</h1>
          <p className="text-muted-foreground mt-1">Administra árbitros y oficiales de mesa.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar Personal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Personal" : "Agregar Personal"}</DialogTitle>
              <DialogDescription>
                {editing ? "Modifica los datos del usuario." : "Crea un usuario nuevo para el sistema."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="fullName">Nombre completo</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label>Roles</Label>
                <div className="grid gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={formData.isReferee}
                      onCheckedChange={(checked) => setFormData({ ...formData, isReferee: Boolean(checked) })}
                    />
                    Árbitro
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={formData.isTableOfficial}
                      onCheckedChange={(checked) => setFormData({ ...formData, isTableOfficial: Boolean(checked) })}
                    />
                    Oficial de Mesa
                  </label>
                </div>
              </div>

              {!editing && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="grid gap-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Guardando..." : editing ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-2">
            <Label htmlFor="search">Buscar</Label>
            <AutocompleteInput
              id="search"
              value={search}
              onValueChange={setSearch}
              options={searchOptions}
              placeholder="Buscar por nombre, email o teléfono"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="arbitro">Árbitros ({referees.length})</TabsTrigger>
          <TabsTrigger value="oficial_mesa">Oficiales de Mesa ({tableOfficials.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="arbitro" className="mt-4">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">Cargando personal...</CardContent>
            </Card>
          ) : filteredPeople.length === 0 ? (
            <EmptyState
              icon={UserCircle}
              title="No hay árbitros"
              description={
                roleFiltered.length === 0 ? "Agregá árbitros para poder asignarlos a los partidos." : "No hay resultados con los filtros aplicados."
              }
              action={{ label: "Agregar Personal", onClick: openCreate }}
            />
          ) : (
            renderTable(filteredPeople)
          )}
        </TabsContent>

        <TabsContent value="oficial_mesa" className="mt-4">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">Cargando personal...</CardContent>
            </Card>
          ) : filteredPeople.length === 0 ? (
            <EmptyState
              icon={UserCircle}
              title="No hay oficiales de mesa"
              description={
                roleFiltered.length === 0
                  ? "Agregá oficiales de mesa para poder asignarlos a los partidos."
                  : "No hay resultados con los filtros aplicados."
              }
              action={{ label: "Agregar Personal", onClick: openCreate }}
            />
          ) : (
            renderTable(filteredPeople)
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar personal</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmás eliminar a <strong>{deleteTarget?.fullName}</strong>? Se eliminará el usuario del sistema.
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

type PersonRow = {
  id: string
  fullName: string
  role: UserRole
  isReferee: boolean
  isTableOfficial: boolean
  email: string | null
  phone: string | null
}

function mapPersonFromApi(row: any): PersonRow {
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    isReferee: Boolean(row.is_referee),
    isTableOfficial: Boolean(row.is_table_official),
    email: row.email ?? null,
    phone: row.phone ?? null,
  }
}
