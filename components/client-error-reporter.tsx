"use client"

import { useEffect } from "react"

export function ClientErrorReporter() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleError = (event: ErrorEvent) => {
      try {
        const payload = {
          type: "error",
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: (event.error && (event.error as any).stack) || null,
          userAgent: navigator.userAgent,
          href: window.location.href,
        }

        void fetch("/api/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } catch {
        // ignorar
      }
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason as any
        const payload = {
          type: "unhandledrejection",
          message: typeof reason === "string" ? reason : reason?.message ?? "unhandledrejection",
          stack: typeof reason === "object" ? reason?.stack ?? null : null,
          userAgent: navigator.userAgent,
          href: window.location.href,
        }

        void fetch("/api/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } catch {
        // ignorar
      }
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])

  return null
}
