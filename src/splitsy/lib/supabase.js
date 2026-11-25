import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasCloud = Boolean(url && key)

export const supabase = hasCloud
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'splitsy-auth' },
    })
  : null
