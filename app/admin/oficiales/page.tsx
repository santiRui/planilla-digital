"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function OficialesRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/admin/personal")
  }, [router])

  return null
}
