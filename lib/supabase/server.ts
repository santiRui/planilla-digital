import { createClient } from "@supabase/supabase-js"

export function createSupabaseServerClient(accessToken?: string) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL")
  }

  if (!anonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return createClient(url, anonKey, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
