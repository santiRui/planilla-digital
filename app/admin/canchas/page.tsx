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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Edit, MapPin, MoreHorizontal, Plus } from "lucide-react"

export default function CanchasPage() {
  const [activeTab, setActiveTab] = useState<"venues" | "courts">("venues")

  const [venues, setVenues] = useState<VenueRow[]>([])
  const [courts, setCourts] = useState<CourtRow[]>([])

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [venueSearch, setVenueSearch] = useState("")

  const [courtSearch, setCourtSearch] = useState("")
  const [courtVenueFilterId, setCourtVenueFilterId] = useState<string>("all")

  const [venueDialogOpen, setVenueDialogOpen] = useState(false)
  const [editingVenue, setEditingVenue] = useState<VenueRow | null>(null)
  const [venueDeleteTarget, setVenueDeleteTarget] = useState<VenueRow | null>(null)

  const [courtDialogOpen, setCourtDialogOpen] = useState(false)
  const [editingCourt, setEditingCourt] = useState<CourtRow | null>(null)
  const [courtDeleteTarget, setCourtDeleteTarget] = useState<CourtRow | null>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [venueForm, setVenueForm] = useState({
    name: "",
    address: "",
  })

  const [courtForm, setCourtForm] = useState({
    venueId: "",
    name: "",
  })

  const venueById = useMemo(() => {
    return Object.fromEntries(venues.map((v) => [v.id, v])) as Record<string, VenueRow>
  }, [venues])

  const venueNameOptions = useMemo(() => {
    return Array.from(new Set(venues.map((v) => v.name).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [venues])

  const filteredVenues = useMemo(() => {
    const q = venueSearch.trim().toLowerCase()
    if (!q) return venues
    return venues.filter((v) => v.name.toLowerCase().includes(q) || (v.address ?? "").toLowerCase().includes(q))
  }, [venues, venueSearch])

  const filteredCourts = useMemo(() => {
    const q = courtSearch.trim().toLowerCase()

    const base = courts.filter((c) => {
      if (courtVenueFilterId !== "all" && c.venueId !== courtVenueFilterId) return false
      if (!q) return true
      const venueName = venueById[c.venueId]?.name ?? ""
      return c.name.toLowerCase().includes(q) || venueName.toLowerCase().includes(q)
    })

    return base
  }, [courts, courtSearch, courtVenueFilterId, venueById])

  const courtSearchOptions = useMemo(() => {
    const courtNames = courts.map((c) => c.name)
    const venueNames = courts.map((c) => venueById[c.venueId]?.name).filter(Boolean) as string[]
    return Array.from(new Set([...courtNames, ...venueNames].filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [courts, venueById])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setVenues([])
        setCourts([])
        setError("Tenés que iniciar sesión para gestionar canchas.")
        setLoading(false)
        return
      }

      const [venuesRes, courtsRes] = await Promise.all([
        fetch("/api/admin/venues", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/courts", { headers: { Authorization: `Bearer ${token}` } }),
      ])

      const venuesJson = (await venuesRes.json().catch(() => null)) as any
      if (!venuesRes.ok) {
        setVenues([])
        setError(venuesJson?.error ?? "No se pudieron cargar las sedes")
      } else {
        setVenues((venuesJson.venues ?? []).map(mapVenueFromApi) as VenueRow[])
      }

      const courtsJson = (await courtsRes.json().catch(() => null)) as any
      if (!courtsRes.ok) {
        setCourts([])
        setError((prev) => prev ?? (courtsJson?.error ?? "No se pudieron cargar las canchas"))
      } else {
        setCourts((courtsJson.courts ?? []).map(mapCourtFromApi) as CourtRow[])
      }

      setLoading(false)
    }

    run()
  }, [supabase])

  const openCreateVenue = () => {
    setEditingVenue(null)
    setVenueForm({ name: "", address: "" })
    setVenueDialogOpen(true)
  }

  const openEditVenue = (venue: VenueRow) => {
    setEditingVenue(venue)
    setVenueForm({ name: venue.name, address: venue.address ?? "" })
    setVenueDialogOpen(true)
  }

  const submitVenue = async () => {
    setError(null)
    setSubmitting(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError("Tenés que iniciar sesión para guardar sedes.")
        return
      }

      const name = venueForm.name.trim()
      const address = venueForm.address.trim()

      if (!name) {
        setError("Completá el nombre de la sede.")
        return
      }

      const isEditing = Boolean(editingVenue?.id)
      const url = isEditing ? `/api/admin/venues/${editingVenue!.id}` : "/api/admin/venues"
      const method = isEditing ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          address: address || null,
        }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo guardar la sede")
        return
      }

      const saved = mapVenueFromApi(json.venue)

      setVenues((prev) => {
        const next = isEditing ? prev.map((v) => (v.id === saved.id ? saved : v)) : [...prev, saved]
        return next.sort((a, b) => a.name.localeCompare(b.name))
      })

      setVenueDialogOpen(false)
      setEditingVenue(null)
      setVenueForm({ name: "", address: "" })
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDeleteVenue = async () => {
    if (!venueDeleteTarget) return

    setError(null)
    setSubmitting(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError("Tenés que iniciar sesión para eliminar sedes.")
        return
      }

      const res = await fetch(`/api/admin/venues/${venueDeleteTarget.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo eliminar la sede")
        return
      }

      setVenues((prev) => prev.filter((v) => v.id !== venueDeleteTarget.id))
      setCourts((prev) => prev.filter((c) => c.venueId !== venueDeleteTarget.id))
      setVenueDeleteTarget(null)

      if (courtVenueFilterId === venueDeleteTarget.id) {
        setCourtVenueFilterId("all")
      }

      if (editingCourt?.venueId === venueDeleteTarget.id) {
        setEditingCourt(null)
        setCourtDialogOpen(false)
      }

      if (courtForm.venueId === venueDeleteTarget.id) {
        setCourtForm((prev) => ({ ...prev, venueId: "" }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const openCreateCourt = () => {
    setEditingCourt(null)
    setCourtForm({ venueId: venues[0]?.id ?? "", name: "" })
    setCourtDialogOpen(true)
  }

  const openEditCourt = (court: CourtRow) => {
    setEditingCourt(court)
    setCourtForm({ venueId: court.venueId, name: court.name })
    setCourtDialogOpen(true)
  }

  const submitCourt = async () => {
    setError(null)
    setSubmitting(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError("Tenés que iniciar sesión para guardar canchas.")
        return
      }

      const venueId = courtForm.venueId
      const name = courtForm.name.trim()

      if (!venueId) {
        setError("Seleccioná una sede.")
        return
      }

      if (!name) {
        setError("Completá el nombre de la cancha.")
        return
      }

      const isEditing = Boolean(editingCourt?.id)
      const url = isEditing ? `/api/admin/courts/${editingCourt!.id}` : "/api/admin/courts"
      const method = isEditing ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ venueId, name }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo guardar la cancha")
        return
      }

      const saved = mapCourtFromApi(json.court)

      setCourts((prev) => {
        const next = isEditing ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved]
        return next.sort((a, b) => {
          const aVenue = venueById[a.venueId]?.name ?? ""
          const bVenue = venueById[b.venueId]?.name ?? ""
          const byVenue = aVenue.localeCompare(bVenue)
          if (byVenue !== 0) return byVenue
          return a.name.localeCompare(b.name)
        })
      })

      setCourtDialogOpen(false)
      setEditingCourt(null)
      setCourtForm({ venueId: venues[0]?.id ?? "", name: "" })
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDeleteCourt = async () => {
    if (!courtDeleteTarget) return

    setError(null)
    setSubmitting(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError("Tenés que iniciar sesión para eliminar canchas.")
        return
      }

      const res = await fetch(`/api/admin/courts/${courtDeleteTarget.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo eliminar la cancha")
        return
      }

      setCourts((prev) => prev.filter((c) => c.id !== courtDeleteTarget.id))
      setCourtDeleteTarget(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Canchas" }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Canchas</h1>
          <p className="text-muted-foreground mt-1">Definí sedes y canchas disponibles para programar partidos.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "venues" ? (
            <Button onClick={openCreateVenue}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Sede
            </Button>
          ) : (
            <Button onClick={openCreateCourt} disabled={venues.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Cancha
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="venues">Sedes ({venues.length})</TabsTrigger>
          <TabsTrigger value="courts">Canchas ({courts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="venues" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-2">
                <Label htmlFor="venue-search">Buscar</Label>
                <AutocompleteInput
                  id="venue-search"
                  value={venueSearch}
                  onValueChange={setVenueSearch}
                  options={venueNameOptions}
                  placeholder="Buscar por nombre o dirección"
                />
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">Cargando sedes...</CardContent>
            </Card>
          ) : filteredVenues.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No hay sedes"
              description={venues.length === 0 ? "Creá tu primera sede para cargar canchas." : "No hay resultados con los filtros aplicados."}
              action={{ label: "Nueva Sede", onClick: openCreateVenue }}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVenues.map((venue) => (
                      <TableRow key={venue.id}>
                        <TableCell className="font-medium">{venue.name}</TableCell>
                        <TableCell>{venue.address ? venue.address : "-"}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Opciones</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditVenue(venue)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setVenueDeleteTarget(venue)}>
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
        </TabsContent>

        <TabsContent value="courts" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="min-w-0">
                  <Label htmlFor="court-search">Buscar</Label>
                  <AutocompleteInput
                    id="court-search"
                    value={courtSearch}
                    onValueChange={setCourtSearch}
                    options={courtSearchOptions}
                    placeholder="Buscar por cancha o sede"
                  />
                </div>

                <div>
                  <Label>Sede</Label>
                  <Select value={courtVenueFilterId} onValueChange={(v) => setCourtVenueFilterId(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {venues.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
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
              <CardContent className="py-12 text-center text-muted-foreground">Cargando canchas...</CardContent>
            </Card>
          ) : venues.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="Primero creá una sede"
              description="Necesitás al menos una sede para poder cargar canchas."
              action={{ label: "Nueva Sede", onClick: () => { setActiveTab("venues"); openCreateVenue() } }}
            />
          ) : filteredCourts.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No hay canchas"
              description={courts.length === 0 ? "Creá tu primera cancha para programar partidos." : "No hay resultados con los filtros aplicados."}
              action={{ label: "Nueva Cancha", onClick: openCreateCourt }}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cancha</TableHead>
                      <TableHead>Sede</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCourts.map((court) => (
                      <TableRow key={court.id}>
                        <TableCell className="font-medium">{court.name}</TableCell>
                        <TableCell>{venueById[court.venueId]?.name ?? "-"}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Opciones</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditCourt(court)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setCourtDeleteTarget(court)}>
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
        </TabsContent>
      </Tabs>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={venueDialogOpen} onOpenChange={setVenueDialogOpen}>
        <DialogTrigger asChild />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVenue ? "Editar Sede" : "Nueva Sede"}</DialogTitle>
            <DialogDescription>{editingVenue ? "Modificá los datos de la sede." : "Cargá la información de la sede."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="venue-name">Nombre</Label>
              <Input
                id="venue-name"
                value={venueForm.name}
                onChange={(e) => setVenueForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Polideportivo Municipal"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="venue-address">Dirección</Label>
              <Input
                id="venue-address"
                value={venueForm.address}
                onChange={(e) => setVenueForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVenueDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitVenue} disabled={submitting || !venueForm.name.trim()}>
              {submitting ? "Guardando..." : editingVenue ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={courtDialogOpen} onOpenChange={setCourtDialogOpen}>
        <DialogTrigger asChild />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCourt ? "Editar Cancha" : "Nueva Cancha"}</DialogTitle>
            <DialogDescription>{editingCourt ? "Modificá los datos de la cancha." : "Cargá la información de la cancha."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Sede</Label>
              <Select value={courtForm.venueId} onValueChange={(v) => setCourtForm((prev) => ({ ...prev, venueId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={venues.length === 0 ? "Sin sedes" : "Seleccionar"} />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="court-name">Nombre</Label>
              <Input
                id="court-name"
                value={courtForm.name}
                onChange={(e) => setCourtForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Cancha 1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCourtDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCourt} disabled={submitting || !courtForm.venueId || !courtForm.name.trim()}>
              {submitting ? "Guardando..." : editingCourt ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(venueDeleteTarget)} onOpenChange={(open) => (!open ? setVenueDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar sede</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmás eliminar la sede <strong>{venueDeleteTarget?.name}</strong>? Esto eliminará también sus canchas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteVenue} disabled={submitting}>
              {submitting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(courtDeleteTarget)} onOpenChange={(open) => (!open ? setCourtDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cancha</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmás eliminar la cancha <strong>{courtDeleteTarget?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCourt} disabled={submitting}>
              {submitting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type VenueRow = {
  id: string
  name: string
  address: string | null
  createdAt?: string
}

type CourtRow = {
  id: string
  venueId: string
  name: string
  createdAt?: string
}

function mapVenueFromApi(row: any): VenueRow {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? null,
    createdAt: row.created_at,
  }
}

function mapCourtFromApi(row: any): CourtRow {
  return {
    id: row.id,
    venueId: row.venue_id,
    name: row.name,
    createdAt: row.created_at,
  }
}
