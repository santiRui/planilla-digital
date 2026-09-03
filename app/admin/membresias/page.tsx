"use client"

import { useEffect, useMemo, useState } from "react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface TeamRow {
  id: string
  name: string
  logoUrl: string | null
  primaryColor: string | null
  categoryId: string | null
}

interface CategoryRow {
  id: string
  name: string
  ageGroup: string | null
}

export default function AdminMembershipsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [selectedTeamId, setSelectedTeamId] = useState<string>("")
  const [teamSearch, setTeamSearch] = useState<string>("")
  const [gamesInput, setGamesInput] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailTeam, setDetailTeam] = useState<TeamRow | null>(null)
  const [detailData, setDetailData] = useState<{ memberships: any[]; usages: any[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>("")
  const [activeSearch, setActiveSearch] = useState<string>("")

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) {
          setError("Tenés que iniciar sesión como admin para gestionar membresías.")
          setLoading(false)
          return
        }

        const [teamsRes, totalsRes, categoriesRes] = await Promise.all([
          fetch("/api/admin/teams", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/admin/team-memberships", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/admin/categories", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        const teamsJson = (await teamsRes.json().catch(() => null)) as any
        const totalsJson = (await totalsRes.json().catch(() => null)) as any
        const categoriesJson = (await categoriesRes.json().catch(() => null)) as any

        if (!teamsRes.ok) {
          setError(teamsJson?.error ?? "No se pudieron cargar los equipos")
          setLoading(false)
          return
        }
        if (!totalsRes.ok) {
          setError(totalsJson?.error ?? "No se pudieron cargar las membresías")
          setLoading(false)
          return
        }

        if (!categoriesRes.ok) {
          setError(categoriesJson?.error ?? "No se pudieron cargar las categorías")
          setLoading(false)
          return
        }

        setTeams(
          (teamsJson.teams ?? []).map((t: any) => ({
            id: t.id as string,
            name: t.name as string,
            logoUrl: (t.logo_url as string | null) ?? null,
            primaryColor: (t.primary_color as string | null) ?? null,
            categoryId: (t.category_id as string | null) ?? null,
          })),
        )
        setTotals((totalsJson.totals ?? {}) as Record<string, number>)
        setCategories(
          (categoriesJson.categories ?? []).map((c: any) => ({
            id: c.id as string,
            name: c.name as string,
            ageGroup: (c.age_group as string | null) ?? null,
          })),
        )
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [supabase])

  const teamOptions = useMemo(() => teams.map((t) => t.name), [teams])

  const handleAssign = async () => {
    setError(null)
    if (!selectedTeamId || !gamesInput) {
      setError("Seleccioná un equipo e ingresá la cantidad de partidos.")
      return
    }

    const games = Number(gamesInput)
    if (!Number.isFinite(games) || games <= 0) {
      setError("La cantidad de partidos debe ser un número mayor a cero.")
      return
    }

    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión como admin para gestionar membresías.")
        return
      }

      const res = await fetch("/api/admin/team-memberships", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teamId: selectedTeamId, games }),
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo asignar la membresía")
        return
      }

      // Actualizar totales en memoria sumando los nuevos juegos
      setTotals((prev) => ({
        ...prev,
        [selectedTeamId]: (prev[selectedTeamId] ?? 0) + games,
      }))
      setGamesInput("")
      setSelectedTeamId("")
      setTeamSearch("")
    } finally {
      setSubmitting(false)
    }
  }

  const openDetail = async (team: TeamRow) => {
    setDetailTeam(team)
    setDetailData(null)
    setDetailLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Tenés que iniciar sesión como admin para gestionar membresías.")
        setDetailLoading(false)
        return
      }

      const res = await fetch(`/api/admin/team-memberships/${team.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        setError(json?.error ?? "No se pudo cargar el detalle de membresías")
        setDetailLoading(false)
        return
      }

      setDetailData({ memberships: json.memberships ?? [], usages: json.usages ?? [] })
    } finally {
      setDetailLoading(false)
    }
  }

  const getTeamNameById = (id: string) => teams.find((t) => t.id === id)?.name ?? id

  const getCategoryLabel = (categoryId: string | null) => {
    if (!categoryId) return "Sin categoría"
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return "Sin categoría"
    return `${cat.name}${cat.ageGroup ? ` (${cat.ageGroup})` : ""}`
  }

  const entriesWithMembership = useMemo(() => {
    const entries = Object.entries(totals).map(([teamId, remaining]) => ({
      teamId,
      remaining: Number(remaining) || 0,
    }))

    const q = activeSearch.trim().toLowerCase()
    if (!q) return entries

    return entries.filter(({ teamId }) => {
      const name = getTeamNameById(teamId).toLowerCase()
      return name.includes(q)
    })
  }, [totals, activeSearch])

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Membresías" }]} />

      <div>
        <h1 className="text-3xl font-bold">Membresías por equipo</h1>
        <p className="text-muted-foreground mt-1">
          Asigna membresías de partidos a los equipos y consulta cuántos partidos les quedan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asignar membresía</CardTitle>
          <CardDescription>Carga una nueva membresía en partidos para un equipo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Equipo</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <AutocompleteInput
                    value={teamSearch}
                    onValueChange={(value) => {
                      setTeamSearch(value)
                      const match = teams.find((t) => t.name === value)
                      if (match) setSelectedTeamId(match.id)
                      else setSelectedTeamId("")
                    }}
                    options={teamOptions}
                    renderOption={(option) => {
                      const team = teams.find((t) => t.name === option)
                      const initials = (team?.name ?? "").substring(0, 2).toUpperCase()
                      const color = team?.primaryColor ?? "#1e293b"
                      return (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-7 w-7 rounded-full flex items-center justify-center border bg-muted overflow-hidden"
                            style={{ borderColor: color }}
                          >
                            {team?.logoUrl ? (
                              <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
                            ) : (
                              <span
                                className="text-[10px] font-semibold"
                                style={{ color: "white", backgroundColor: color }}
                              >
                                {initials}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium leading-tight">{team?.name ?? option}</span>
                            <span className="text-[11px] text-muted-foreground leading-tight">
                              {getCategoryLabel(team?.categoryId ?? null)}
                            </span>
                          </div>
                        </div>
                      )
                    }}
                    placeholder="Buscar equipo"
                  />
                </div>
                {teamSearch && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      setTeamSearch("")
                      setSelectedTeamId("")
                    }}
                  >
                    ×
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Cantidad de partidos</Label>
              <Input
                value={gamesInput}
                onChange={(e) => setGamesInput(e.target.value)}
                type="number"
                min={1}
                className="w-full"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleAssign} disabled={submitting}>
            {submitting ? "Guardando..." : "Asignar membresía"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipos con membresía activa</CardTitle>
          <CardDescription>Listado de equipos que tienen partidos de membresía restantes.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando datos...</p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 max-w-xs">
                <Label htmlFor="active-search">Buscar equipo</Label>
                <Input
                  id="active-search"
                  value={activeSearch}
                  onChange={(e) => setActiveSearch(e.target.value)}
                  placeholder="Escribí el nombre del equipo"
                  className="h-8 text-sm"
                />
              </div>

              {entriesWithMembership.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {Object.keys(totals).length === 0
                    ? "No hay equipos con membresías registradas."
                    : "No hay equipos que coincidan con la búsqueda."}
                </p>
              ) : (
                <div className="space-y-2">
              {entriesWithMembership.map(({ teamId, remaining }) => {
                const team = teams.find((t) => t.id === teamId)
                const initials = (team?.name ?? "").substring(0, 2).toUpperCase()
                const color = team?.primaryColor ?? "#1e293b"
                return (
                  <div
                    key={teamId}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center border bg-muted overflow-hidden"
                        style={{ borderColor: color }}
                      >
                        {team?.logoUrl ? (
                          <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold" style={{ color: "white", backgroundColor: color }}>
                            {initials}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{team?.name ?? teamId}</div>
                        <div className="text-xs text-muted-foreground">
                          {getCategoryLabel(team?.categoryId ?? null)}
                        </div>
                      </div>
                    </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">
                      Partidos restantes:{" "}
                      <span
                        className={
                          remaining === 0
                            ? "font-semibold text-red-600"
                            : "font-semibold"
                        }
                      >
                        {remaining}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDetail(team ?? { id: teamId, name: getTeamNameById(teamId), logoUrl: null, primaryColor: null, categoryId: null })}
                    >
                      Ver detalle
                    </Button>
                  </div>
                  </div>
                )
              })}
              </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {detailTeam && (
        <Dialog open={Boolean(detailTeam)} onOpenChange={(open) => (!open ? setDetailTeam(null) : undefined)}>
          <DialogContent className="max-w-xl sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalle de membresías – {detailTeam.name}</DialogTitle>
              <DialogDescription>
                Editá la cantidad de partidos restantes o elimina membresías de este equipo.
              </DialogDescription>
            </DialogHeader>

            {detailLoading || !detailData ? (
              <p className="text-sm text-muted-foreground">Cargando detalle...</p>
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <div className="font-semibold mb-1">Membresías</div>
                  {detailData.memberships.length === 0 ? (
                    <p className="text-muted-foreground">Este equipo no tiene membresías registradas.</p>
                  ) : (
                    <div className="space-y-3">
                      {detailData.memberships.map((m) => {
                        const isEditing = editingMembershipId === m.id
                        const displayValue = isEditing ? editingValue : String(m.remaining_games)
                        return (
                          <div
                            key={m.id}
                            className="flex flex-col gap-2 rounded border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="text-sm">
                              <div>
                                Cargada el {new Date(m.created_at).toLocaleDateString("es-AR")}
                              </div>
                              <div className="text-xs text-muted-foreground">ID: {m.id}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                              <Input
                                type="number"
                                min={0}
                                className="w-20 h-8 text-right"
                                value={displayValue}
                                disabled={!isEditing}
                                onChange={(e) => setEditingValue(e.target.value)}
                              />
                              <span className="text-xs text-muted-foreground">restantes</span>
                              {isEditing ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      if (!detailTeam) return
                                      const next = Number(editingValue.trim())
                                      if (!Number.isFinite(next) || next < 0) {
                                        setError("La cantidad debe ser un número mayor o igual a 0.")
                                        return
                                      }

                                      const { data: sessionData } = await supabase.auth.getSession()
                                      const token = sessionData.session?.access_token
                                      if (!token) {
                                        setError("Tenés que iniciar sesión como admin para gestionar membresías.")
                                        return
                                      }

                                      const res = await fetch(
                                        `/api/admin/team-memberships/${detailTeam.id}?membershipId=${encodeURIComponent(
                                          m.id as string,
                                        )}`,
                                        {
                                          method: "PATCH",
                                          headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                          },
                                          body: JSON.stringify({ remaining_games: next }),
                                        },
                                      )
                                      const json = (await res.json().catch(() => null)) as any
                                      if (!res.ok) {
                                        setError(json?.error ?? "No se pudo actualizar la membresía")
                                        return
                                      }

                                      setDetailData((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              memberships: prev.memberships.map((mm) =>
                                                mm.id === m.id ? { ...mm, remaining_games: next } : mm,
                                              ),
                                            }
                                          : prev,
                                      )
                                      setTotals((prev) => {
                                        if (!detailTeam) return prev
                                        const current = prev[detailTeam.id] ?? 0
                                        const delta = next - (m.remaining_games as number)
                                        return { ...prev, [detailTeam.id]: current + delta }
                                      })
                                      ;(m as any).remaining_games = next
                                      setEditingMembershipId(null)
                                      setEditingValue("")
                                    }}
                                  >
                                    Guardar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingMembershipId(null)
                                      setEditingValue("")
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingMembershipId(m.id as string)
                                    setEditingValue(String(m.remaining_games))
                                  }}
                                >
                                  Editar
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  if (!detailTeam) return
                                  const ok = window.confirm("¿Eliminar esta membresía?")
                                  if (!ok) return

                                  const { data: sessionData } = await supabase.auth.getSession()
                                  const token = sessionData.session?.access_token
                                  if (!token) {
                                    setError("Tenés que iniciar sesión como admin para gestionar membresías.")
                                    return
                                  }

                                  const res = await fetch(
                                    `/api/admin/team-memberships/${detailTeam.id}?membershipId=${encodeURIComponent(
                                      m.id as string,
                                    )}`,
                                    {
                                      method: "DELETE",
                                      headers: { Authorization: `Bearer ${token}` },
                                    },
                                  )
                                  const json = (await res.json().catch(() => null)) as any
                                  if (!res.ok) {
                                    setError(json?.error ?? "No se pudo eliminar la membresía")
                                    return
                                  }

                                  setDetailData((prev) => {
                                    if (!prev) return prev
                                    const nextMemberships = prev.memberships.filter((mm) => mm.id !== m.id)
                                    const next = {
                                      ...prev,
                                      memberships: nextMemberships,
                                    }
                                    // Si ya no quedan membresías para este equipo, cerramos el diálogo
                                    if (nextMemberships.length === 0) {
                                      setDetailTeam(null)
                                    }
                                    return next
                                  })

                                  setTotals((prev) => {
                                    if (!detailTeam) return prev
                                    const current = prev[detailTeam.id] ?? 0
                                    return { ...prev, [detailTeam.id]: Math.max(0, current - (m.remaining_games as number)) }
                                  })

                                  // Limpiar estado de edición asociado
                                  if (editingMembershipId === m.id) {
                                    setEditingMembershipId(null)
                                    setEditingValue("")
                                  }
                                }}
                              >
                              Eliminar
                            </Button>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-semibold mb-1">Usos</div>
                  {detailData.usages.length === 0 ? (
                    <p className="text-muted-foreground">Todavía no se usaron partidos de membresía.</p>
                  ) : (
                    <ul className="list-disc pl-4 space-y-1">
                      {detailData.usages.map((u) => (
                        <li key={`${u.team_membership_id}-${u.match_id}-${u.used_at}`}>
                          Partido {u.match_id} – usado el {new Date(u.used_at).toLocaleString("es-AR")}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
