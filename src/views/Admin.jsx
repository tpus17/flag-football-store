import React, { useEffect, useState } from 'react'
import { money, dollarsToCents, adminApi, getPass, setPass, clearPass } from '../lib'

// Load an image file, scale it down to fit maxDim, and return a JPEG data URL.
// Keeps uploads small + fast (phone photos can be huge).
function resizeImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const img = new Image()
    reader.onload = () => { img.src = reader.result }
    reader.onerror = () => reject(new Error('Could not read file'))
    img.onerror = () => reject(new Error('Not a valid image'))
    img.onload = () => {
      let { width, height } = img
      if (width >= height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim }
      else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height) // flatten transparency for JPEG
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    reader.readAsDataURL(file)
  })
}

export default function Admin({ settings, onSettingsChange }) {
  const [authed, setAuthed] = useState(!!getPass())
  const [tab, setTab] = useState('orders')

  if (!authed) return <Login onDone={() => setAuthed(true)} />

  return (
    <div className="wrap">
      <header style={{ display: 'flex', alignItems: 'center', padding: '18px 0' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Store Admin</h1>
        <div className="spacer" />
        <a href="#/" className="btn ghost sm" style={{ marginRight: 8 }}>View store ↗</a>
        <button className="btn ghost sm" onClick={() => { clearPass(); location.reload() }}>Log out</button>
      </header>

      <div className="tabs">
        {['orders', 'products', 'settings'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}
            style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {tab === 'orders' && <Orders />}
      {tab === 'products' && <Products />}
      {tab === 'settings' && <Settings settings={settings} onSaved={onSettingsChange} />}
    </div>
  )
}

function Login({ onDone }) {
  const [pass, setPassLocal] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    setPass(pass)
    try {
      await adminApi('stats')
      onDone()
    } catch (e) {
      clearPass()
      setErr('Incorrect passcode.')
    } finally { setBusy(false) }
  }
  return (
    <div className="wrap">
      <form className="login-box admin-card" onSubmit={submit}>
        <h2 style={{ marginTop: 0 }}>Store Admin</h2>
        <p className="muted">Enter the admin passcode.</p>
        <input type="password" value={pass} onChange={(e) => setPassLocal(e.target.value)} placeholder="Passcode" autoFocus />
        {err && <div className="err mt">{err}</div>}
        <button className="btn block mt" disabled={busy}>{busy ? 'Checking…' : 'Enter'}</button>
      </form>
    </div>
  )
}

// ---------------- Orders ----------------
function Orders() {
  const [orders, setOrders] = useState(null)
  const [stats, setStats] = useState(null)
  const [filter, setFilter] = useState('all')

  async function load() {
    const [o, s] = await Promise.all([adminApi('list_orders'), adminApi('stats')])
    setOrders(o.orders); setStats(s)
  }
  useEffect(() => { load() }, [])

  async function toggle(id, field, value) {
    await adminApi('update_order', { id, [field]: value })
    load()
  }
  async function del(id) {
    if (!confirm('Delete this order? Stock is NOT restored automatically.')) return
    await adminApi('delete_order', { id })
    load()
  }

  if (!orders) return <p className="empty">Loading orders…</p>

  const shown = orders.filter((o) =>
    filter === 'all' ? true :
    filter === 'unpaid' ? !o.paid :
    filter === 'paid_unfulfilled' ? (o.paid && !o.fulfilled) : true)

  return (
    <>
      {stats && (
        <div className="stat-row">
          <div className="stat"><b>{money(stats.paid_cents)}</b><span>Raised (paid)</span></div>
          <div className="stat"><b>{money(stats.pending_cents)}</b><span>Awaiting payment</span></div>
          <div className="stat"><b>{stats.order_count}</b><span>Orders</span></div>
          <div className="stat"><b>{stats.items_sold}</b><span>Items sold</span></div>
        </div>
      )}

      <div className="row mt" style={{ marginBottom: 12 }}>
        <label className="field" style={{ margin: 0 }}>Show:</label>
        <select style={{ width: 220 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All orders</option>
          <option value="unpaid">Awaiting payment</option>
          <option value="paid_unfulfilled">Paid · not handed out</option>
        </select>
      </div>

      {shown.length === 0 ? <p className="empty">No orders here yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Buyer</th><th>Items</th><th>Total</th>
                <th>Pay</th><th>Paid</th><th>Handed out</th><th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id}>
                  <td>{new Date(o.created_at).toLocaleDateString()}<br /><span className="muted">{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                  <td>
                    <b>{o.buyer_name}</b><br />
                    <span className="muted">{o.contact_type === 'email'
                      ? <a href={`mailto:${o.buyer_contact}`}>{o.buyer_contact}</a>
                      : <a href={`tel:${o.buyer_contact}`}>{o.buyer_contact}</a>}</span>
                    {o.note && <div className="muted" style={{ fontSize: '0.8rem' }}>“{o.note}”</div>}
                  </td>
                  <td>
                    {(o.order_items || []).map((it) => (
                      <div key={it.id}>{it.qty}× {it.product_name}{it.size_label !== 'One Size' ? ` (${it.size_label})` : ''}</div>
                    ))}
                  </td>
                  <td><b>{money(o.total_cents)}</b></td>
                  <td style={{ textTransform: 'capitalize' }}>{o.payment_method}</td>
                  <td><button className={`pill ${o.paid ? 'yes' : 'no'}`} onClick={() => toggle(o.id, 'paid', !o.paid)}>{o.paid ? 'Paid' : 'Mark paid'}</button></td>
                  <td><button className={`pill ${o.fulfilled ? 'yes' : 'no'}`} onClick={() => toggle(o.id, 'fulfilled', !o.fulfilled)}>{o.fulfilled ? 'Done' : 'Mark done'}</button></td>
                  <td><button className="btn danger sm" onClick={() => del(o.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------------- Products ----------------
function Products() {
  const [products, setProducts] = useState(null)
  const [editing, setEditing] = useState(null)

  async function load() {
    const { products } = await adminApi('list_products')
    setProducts(products)
  }
  useEffect(() => { load() }, [])

  if (editing) return <ProductEditor product={editing} onDone={() => { setEditing(null); load() }} />
  if (!products) return <p className="empty">Loading products…</p>

  return (
    <>
      <button className="btn" onClick={() => setEditing({ isNew: true, name: '', description: '', price_dollars: '', image_url: '', active: true, sort_order: (products.length + 1), variants: [{ size_label: 'One Size' }] })}>+ New product</button>
      <div className="mt">
        {products.map((p) => (
          <div className="admin-card" key={p.id}>
            <div className="row">
              <b style={{ fontSize: '1.05rem' }}>{p.name}</b>
              {!p.active && <span className="pill no">Hidden</span>}
              <div className="spacer" />
              <span className="price">{money(p.price_cents)}</span>
            </div>
            <div className="muted mt" style={{ fontSize: '0.86rem' }}>
              {(p.product_variants || []).map((v) => v.size_label).join(' · ') || 'One size'}
            </div>
            <div className="row mt">
              <button className="btn ghost sm" onClick={() => setEditing(toEditable(p))}>Edit</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function toEditable(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    price_dollars: (p.price_cents / 100).toString(),
    image_url: p.image_url || '',
    active: p.active,
    sort_order: p.sort_order,
    variants: (p.product_variants || []).slice().sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({ id: v.id, size_label: v.size_label })),
  }
}

function ProductEditor({ product, onDone }) {
  const [p, setP] = useState(product)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }))
  const setVar = (i, k, v) => setP((x) => ({ ...x, variants: x.variants.map((vr, j) => j === i ? { ...vr, [k]: v } : vr) }))
  const addVar = () => setP((x) => ({ ...x, variants: [...x.variants, { size_label: '' }] }))
  const rmVar = (i) => setP((x) => ({ ...x, variants: x.variants.filter((_, j) => j !== i) }))
  const [uploading, setUploading] = useState(false)

  async function uploadPhoto(file) {
    if (!file) return
    setErr(''); setUploading(true)
    try {
      const dataUrl = await resizeImage(file, 1000, 0.82)
      const { url } = await adminApi('upload_image', { data_url: dataUrl, filename: file.name })
      set('image_url', url)
    } catch (e) {
      setErr('Photo upload failed: ' + e.message)
    } finally { setUploading(false) }
  }

  async function save() {
    setErr('')
    if (!p.name.trim()) return setErr('Name is required.')
    if (p.variants.length === 0) return setErr('Add at least one size (use "One Size" if not sized).')
    setBusy(true)
    try {
      await adminApi('save_product', {
        product: {
          id: p.id || null,
          name: p.name.trim(),
          description: p.description,
          price_cents: dollarsToCents(p.price_dollars),
          image_url: p.image_url.trim(),
          active: p.active,
          sort_order: Number(p.sort_order) || 0,
          variants: p.variants.map((v, i) => ({
            id: v.id || null,
            size_label: (v.size_label || 'One Size').trim() || 'One Size',
            sort_order: i + 1,
          })),
        },
      })
      onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function del() {
    if (!confirm('Delete this product? Past orders keep a name snapshot.')) return
    setBusy(true)
    try { await adminApi('delete_product', { id: p.id }); onDone() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="admin-card">
      <h2 style={{ marginTop: 0 }}>{p.isNew ? 'New product' : 'Edit product'}</h2>
      <div className="two-col">
        <div>
          <label className="field">Name</label>
          <input value={p.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="field">Price (USD)</label>
          <input type="number" step="0.01" min="0" value={p.price_dollars} onChange={(e) => set('price_dollars', e.target.value)} placeholder="20.00" />
        </div>
      </div>

      <label className="field">Description</label>
      <textarea rows={2} value={p.description} onChange={(e) => set('description', e.target.value)} />

      <label className="field">Photo (optional)</label>
      <div className="row" style={{ alignItems: 'center' }}>
        {p.image_url && <img src={p.image_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
        <label className="btn ghost sm" style={{ cursor: uploading ? 'default' : 'pointer' }}>
          {uploading ? 'Uploading…' : (p.image_url ? 'Change photo' : '📷 Upload photo')}
          <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
        </label>
        {p.image_url && <button className="btn ghost sm" type="button" onClick={() => set('image_url', '')}>Remove</button>}
      </div>
      <p className="hint">Pick a photo from this device — it’s resized and hosted for you. Or paste an image URL below.</p>
      <input value={p.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="https://… (optional image URL)" />

      <div className="two-col mt">
        <div>
          <label className="field">Sort order</label>
          <input type="number" value={p.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
        </div>
        <div>
          <label className="field">Visible in store?</label>
          <select value={p.active ? '1' : '0'} onChange={(e) => set('active', e.target.value === '1')}>
            <option value="1">Yes — show it</option>
            <option value="0">No — hide it</option>
          </select>
        </div>
      </div>

      <label className="field mt">Sizes</label>
      <p className="hint">Add each size you offer. Use a single row named “One Size” if the item isn’t sized.</p>
      {p.variants.map((v, i) => (
        <div className="row mt" key={i}>
          <input style={{ flex: 1 }} value={v.size_label} onChange={(e) => setVar(i, 'size_label', e.target.value)} placeholder="Size (S, M, L…)" />
          <button className="btn danger sm" onClick={() => rmVar(i)}>✕</button>
        </div>
      ))}
      <button className="btn ghost sm mt" onClick={addVar}>+ Add size</button>

      {err && <div className="err mt">{err}</div>}

      <div className="row mt" style={{ marginTop: 18 }}>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
        <button className="btn ghost" onClick={onDone} disabled={busy}>Cancel</button>
        <div className="spacer" />
        {!p.isNew && <button className="btn danger" onClick={del} disabled={busy}>Delete</button>}
      </div>
    </div>
  )
}

// ---------------- Settings ----------------
function Settings({ settings, onSaved }) {
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (settings) setS({ ...settings, goal_dollars: (settings.fundraiser_goal_cents / 100).toString() })
  }, [settings])

  if (!s) return <p className="empty">Loading…</p>
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }))

  async function save() {
    setErr(''); setMsg(''); setBusy(true)
    try {
      await adminApi('save_settings', {
        settings: {
          team_name: s.team_name, tagline: s.tagline,
          venmo_handle: s.venmo_handle, zelle_info: s.zelle_info, cash_info: s.cash_info,
          pickup_info: s.pickup_info, accent_color: s.accent_color,
          fundraiser_goal_cents: dollarsToCents(s.goal_dollars),
        },
      })
      setMsg('Saved!')
      onSaved && onSaved()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="admin-card" style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Store settings</h2>
      <label className="field">Team name</label>
      <input value={s.team_name} onChange={(e) => set('team_name', e.target.value)} />
      <label className="field">Tagline</label>
      <input value={s.tagline} onChange={(e) => set('tagline', e.target.value)} />

      <div className="two-col mt">
        <div>
          <label className="field">Venmo handle (no @)</label>
          <input value={s.venmo_handle || ''} onChange={(e) => set('venmo_handle', e.target.value)} placeholder="CoachSmith" />
        </div>
        <div>
          <label className="field">Accent color</label>
          <input type="color" value={s.accent_color} onChange={(e) => set('accent_color', e.target.value)} style={{ height: 44, padding: 4 }} />
        </div>
      </div>

      <label className="field">Zelle info (email or phone)</label>
      <input value={s.zelle_info || ''} onChange={(e) => set('zelle_info', e.target.value)} placeholder="coach@email.com" />

      <label className="field">Cash instructions</label>
      <input value={s.cash_info || ''} onChange={(e) => set('cash_info', e.target.value)} />

      <label className="field">Pickup info (shown after checkout)</label>
      <textarea rows={2} value={s.pickup_info || ''} onChange={(e) => set('pickup_info', e.target.value)} />

      <label className="field">Fundraiser goal (USD, 0 to hide)</label>
      <input type="number" min="0" value={s.goal_dollars} onChange={(e) => set('goal_dollars', e.target.value)} placeholder="1000" />

      {err && <div className="err mt">{err}</div>}
      {msg && <div className="mt" style={{ color: 'var(--accent-dark)', fontWeight: 700 }}>{msg}</div>}
      <button className="btn mt" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </div>
  )
}
