import React, { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Store from './views/Store.jsx'
import Admin from './views/Admin.jsx'

// Darken a hex color for hover/accent-dark.
function darken(hex, amt = 0.16) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return hex
  const adj = (h) => Math.max(0, Math.round(parseInt(h, 16) * (1 - amt)))
  return `rgb(${adj(m[1])}, ${adj(m[2])}, ${adj(m[3])})`
}

function useRoute() {
  const get = () => (window.location.hash.replace(/^#\/?/, '') || 'store')
  const [route, setRoute] = useState(get())
  useEffect(() => {
    const on = () => setRoute(get())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export default function App() {
  const route = useRoute()
  const [settings, setSettings] = useState(null)

  async function loadSettings() {
    const { data } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle()
    if (data) setSettings(data)
  }

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (settings?.accent_color) {
      document.documentElement.style.setProperty('--accent', settings.accent_color)
      document.documentElement.style.setProperty('--accent-dark', darken(settings.accent_color))
    }
    if (settings?.team_name) document.title = `${settings.team_name} — Team Store`
  }, [settings])

  if (route.startsWith('admin')) {
    return <Admin settings={settings} onSettingsChange={loadSettings} />
  }
  return <Store settings={settings} />
}
