/*
 * Shared server-side helpers for the /api functions.
 * Uses the Supabase SERVICE ROLE key — never expose this to the browser.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export function readBody(req) {
  // Vercel usually parses JSON bodies; fall back to manual parsing.
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body)
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
  })
}

export function requireAdmin(body, res) {
  const expected = process.env.ADMIN_PASSCODE
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_PASSCODE is not set on the server.' })
    return false
  }
  if (!body || body.passcode !== expected) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
