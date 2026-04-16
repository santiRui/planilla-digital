"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Trophy,
  Users,
  UserCircle,
  Calendar,
  Settings,
  LayoutGrid,
  ClipboardList,
  MapPin,
  Layers,
  ChevronLeft,
  Menu,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutGrid },
  { name: "Torneos", href: "/admin/torneos", icon: Trophy },
  { name: "Categorías", href: "/admin/categorias", icon: Layers },
  { name: "Equipos", href: "/admin/equipos", icon: Users },
  { name: "Jugadores", href: "/admin/jugadores", icon: UserCircle },
  { name: "Cuerpo Técnico", href: "/admin/tecnicos", icon: ClipboardList },
  { name: "Fixture", href: "/admin/fixture", icon: Calendar },
  { name: "Programación", href: "/admin/programacion", icon: MapPin },
  { name: "Jornada", href: "/admin/jornada", icon: Calendar },
  { name: "Goleadores", href: "/admin/goleadores", icon: Trophy },
  { name: "Canchas", href: "/admin/canchas", icon: MapPin },
  { name: "Fases", href: "/admin/fases", icon: Layers },
  { name: "Contabilidad", href: "/admin/tesoreria", icon: ClipboardList },
  { name: "Observaciones", href: "/admin/observaciones", icon: AlertTriangle },
  { name: "Personal", href: "/admin/personal", icon: UserCircle },
  { name: "Configuración", href: "/admin/configuracion", icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 lg:hidden bg-transparent"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Abrir menú</span>
      </Button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r bg-card transition-all duration-300",
          collapsed ? "w-16" : "w-64",
          "lg:relative",
          // Mobile: hidden by default, shown when not collapsed
          collapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <Link href="/admin" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Trophy className="h-5 w-5" />
              </div>
              <span className="font-semibold">Básquet Admin</span>
            </Link>
          )}
          <Button variant="ghost" size="icon" className="hidden lg:flex" onClick={() => setCollapsed(!collapsed)}>
            <ChevronLeft className={cn("h-5 w-5 transition-transform", collapsed && "rotate-180")} />
            <span className="sr-only">{collapsed ? "Expandir" : "Colapsar"}</span>
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t p-4 space-y-3">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <UserCircle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 truncate">
                <p className="text-sm font-medium truncate">Administrador</p>
                <p className="text-xs text-muted-foreground">admin@torneo.com</p>
              </div>
            </div>
          )}
          {!collapsed && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center"
              onClick={async () => {
                const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser")
                const supabase = createSupabaseBrowserClient()
                await supabase.auth.signOut()
                router.replace("/login")
              }}
            >
              Cerrar sesión
            </Button>
          )}
        </div>
      </aside>

      {/* Overlay for mobile */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}
    </>
  )
}
