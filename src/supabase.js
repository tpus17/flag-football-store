/*
 * Flag Football Team Store — public Supabase client (anon key).
 * Used only to read active products/variants and store settings.
 * All order data and writes go through the /api serverless functions.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY in .env')
}

export const supabase = createClient(url, key)
