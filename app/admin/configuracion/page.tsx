"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Bell, Globe, Shield } from "lucide-react"

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Administración", href: "/admin" }, { label: "Configuración" }]} />

      <div>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground mt-1">Ajustes generales del sistema.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle>General</CardTitle>
            </div>
            <CardDescription>Configuración general del torneo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Modo Oscuro</Label>
                <p className="text-sm text-muted-foreground">Activar tema oscuro en la interfaz</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Vista Pública</Label>
                <p className="text-sm text-muted-foreground">Permitir acceso público a fixture y estadísticas</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Notificaciones</CardTitle>
            </div>
            <CardDescription>Configurar alertas y notificaciones</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Notificar Cambios de Fixture</Label>
                <p className="text-sm text-muted-foreground">Enviar alertas cuando se modifique la programación</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Resultados en Tiempo Real</Label>
                <p className="text-sm text-muted-foreground">Actualizar marcadores automáticamente</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Seguridad</CardTitle>
            </div>
            <CardDescription>Opciones de acceso y permisos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Requerir Confirmación</Label>
                <p className="text-sm text-muted-foreground">Confirmar acciones críticas antes de ejecutar</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Registro de Actividad</Label>
                <p className="text-sm text-muted-foreground">Mantener historial de cambios</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
