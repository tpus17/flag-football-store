import React, { useEffect, useState } from 'react'
import { money, dollarsToCents, adminApi, getPass, setPass, clearPass } from '../lib'
import { PreviewImage, DEFAULT_PLACEMENT, placementKey, lookupPlacement } from '../Preview.jsx'

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

// Like resizeImage but keeps transparency (PNG) — for logo overlays.
function resizePng(file, maxDim) {
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
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }
    reader.readAsDataURL(file)
  })
}

// Parse the editor's option groups (name + comma choices) into {name, choices[]}.
function parseGroups(options) {
  return (options || [])
    .map((g) => ({ name: (g.name || '').trim(), choices: (g.choicesText || '').split(',').map((s) => s.trim()).filter(Boolean) }))
    .filter((g) => g.name && g.choices.length)
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
        <a href="/" target="_blank" rel="noopener noreferrer" className="btn ghost sm" style={{ marginRight: 8 }}>View store ↗</a>
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
                    {(o.order_items || []).map((it) => {
                      const opts = it.options && Object.keys(it.options).length
                        ? Object.entries(it.options).map(([k, v]) => `${k}: ${v}`).join(', ')
                        : it.size_label
                      return <div key={it.id}>{it.qty}× {it.product_name}{opts ? ` — ${opts}` : ''}</div>
                    })}
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
      <button className="btn" onClick={() => setEditing({ isNew: true, name: '', description: '', price_dollars: '', image_url: '', images: [], active: true, sort_order: (products.length + 1), options: [], preview: { colorImages: {}, logoImages: {}, placements: {} } })}>+ New product</button>
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
              {(p.options || []).map((g) => `${g.name}: ${(g.choices || []).join('/')}`).join('   ·   ') || 'No options'}
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
    images: (Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : [])),
    active: p.active,
    sort_order: p.sort_order,
    options: (Array.isArray(p.options) ? p.options : []).map((g) => ({ name: g.name || '', choicesText: (g.choices || []).join(', '), upchargeDollars: Number(g.upcharge) > 0 ? (g.upcharge / 100).toString() : '', print: !!g.print })),
    preview: (p.preview && typeof p.preview === 'object') ? {
      colorImages: p.preview.colorImages || {},
      logoImages: p.preview.logoImages || {},
      placements: p.preview.placements || {},
    } : { colorImages: {}, logoImages: {}, placements: {} },
  }
}

function ProductEditor({ product, onDone }) {
  const [p, setP] = useState(product)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }))
  const setGroup = (i, k, v) => setP((x) => ({ ...x, options: x.options.map((g, j) => j === i ? { ...g, [k]: v } : g) }))
  const addGroup = (name, choicesText, upchargeDollars = '') => setP((x) => ({ ...x, options: [...x.options, { name, choicesText, upchargeDollars }] }))
  const addFrontBack = () => setP((x) => ({ ...x, options: [
    ...x.options,
    { name: 'Front Print', choicesText: 'None, Crest, Wordmark', upchargeDollars: '5', print: true },
    { name: 'Back Print', choicesText: 'None, Crest, Wordmark', upchargeDollars: '5', print: true },
  ] }))
  const addApparelTemplate = () => setP((x) => {
    const has = (n) => x.options.some((g) => (g.name || '').toLowerCase() === n.toLowerCase())
    const t = [
      { name: 'Size', choicesText: 'YS, YM, YL, S, M, L, XL' },
      { name: 'Color', choicesText: 'Maroon, Gold, Black, White' },
      { name: 'Front Print', choicesText: 'None, Crest, Wordmark', upchargeDollars: '5', print: true },
      { name: 'Placement', choicesText: 'Left chest, Full front' },
      { name: 'Back Print', choicesText: 'None, Crest, Wordmark', upchargeDollars: '5', print: true },
    ]
    return { ...x, options: [...x.options, ...t.filter((g) => !has(g.name))] }
  })
  const rmGroup = (i) => setP((x) => ({ ...x, options: x.options.filter((_, j) => j !== i) }))
  const hasGroup = (name) => p.options.some((g) => (g.name || '').toLowerCase() === name.toLowerCase())
  const [uploading, setUploading] = useState(false)
  const addImg = (url) => setP((x) => ({ ...x, images: [...(x.images || []), url] }))
  const rmImg = (i) => setP((x) => ({ ...x, images: x.images.filter((_, j) => j !== i) }))
  const moveImg = (i, d) => setP((x) => {
    const arr = [...x.images]; const j = i + d
    if (j < 0 || j >= arr.length) return x
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    return { ...x, images: arr }
  })

  async function uploadPhotos(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setErr(''); setUploading(true)
    try {
      for (const file of files) {
        const dataUrl = await resizeImage(file, 1000, 0.82)
        const { url } = await adminApi('upload_image', { data_url: dataUrl, filename: file.name })
        addImg(url)
      }
    } catch (e) {
      setErr('Photo upload failed: ' + e.message)
    } finally { setUploading(false) }
  }

  async function save() {
    setErr('')
    if (!p.name.trim()) return setErr('Name is required.')
    setBusy(true)
    try {
      await adminApi('save_product', {
        product: {
          id: p.id || null,
          name: p.name.trim(),
          description: p.description,
          price_cents: dollarsToCents(p.price_dollars),
          images: p.images || [],
          active: p.active,
          sort_order: Number(p.sort_order) || 0,
          options: p.options.map((g) => ({
            name: (g.name || '').trim(),
            choices: (g.choicesText || '').split(',').map((s) => s.trim()).filter(Boolean),
            upcharge: dollarsToCents(g.upchargeDollars),
            print: !!g.print,
          })).filter((g) => g.name && g.choices.length),
          preview: p.preview || { colorImages: {}, logoImages: {}, placements: {} },
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

      <label className="field">Photos</label>
      <p className="hint">Upload one or more — the first is the cover shoppers see. Use ◀ ▶ to reorder.</p>
      {p.images.length > 0 && (
        <div className="img-grid">
          {p.images.map((url, i) => (
            <div className="img-thumb" key={url + i}>
              <img src={url} alt="" />
              {i === 0 && <span className="cover-badge">Cover</span>}
              <div className="img-actions">
                <button type="button" disabled={i === 0} onClick={() => moveImg(i, -1)} title="Move left">◀</button>
                <button type="button" className="rm" onClick={() => rmImg(i)} title="Remove">✕</button>
                <button type="button" disabled={i === p.images.length - 1} onClick={() => moveImg(i, 1)} title="Move right">▶</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <label className="btn ghost sm mt" style={{ cursor: uploading ? 'default' : 'pointer', display: 'inline-block' }}>
        {uploading ? 'Uploading…' : (p.images.length ? '📷 Add more photos' : '📷 Upload photos')}
        <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={(e) => uploadPhotos(e.target.files)} />
      </label>

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

      <label className="field mt">Options</label>
      <p className="hint">Add the choices shoppers pick from. For a shirt, use the one-click template below — it sets up Size, Color, Front Print, Placement, and Back Print (with the +$5 second-side charge already wired). Or add options individually. Separate choices with commas.</p>
      <button className="btn sm" onClick={addApparelTemplate} style={{ marginBottom: 4 }}>🎽 Apparel template (Size · Color · Front &amp; Back print · Placement)</button>
      {p.options.map((g, i) => (
        <div className="opt-editor" key={i}>
          <div className="row">
            <input style={{ flex: 1 }} value={g.name} onChange={(e) => setGroup(i, 'name', e.target.value)} placeholder="Option name (e.g. Size)" />
            <button className="btn danger sm" onClick={() => rmGroup(i)}>✕</button>
          </div>
          <input className="mt" value={g.choicesText} onChange={(e) => setGroup(i, 'choicesText', e.target.value)} placeholder="Choices, comma-separated (e.g. S, M, L, XL)" />
          <div className="row mt" style={{ alignItems: 'center' }}>
            <span className="hint" style={{ margin: 0 }}>Upcharge:</span>
            <div style={{ position: 'relative', width: 100 }}>
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }}>$</span>
              <input type="number" step="0.01" min="0" style={{ paddingLeft: 20 }} value={g.upchargeDollars || ''} onChange={(e) => setGroup(i, 'upchargeDollars', e.target.value)} placeholder="0.00" />
            </div>
            <label className="hint" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={!!g.print} onChange={(e) => setGroup(i, 'print', e.target.checked)} />
              Print location (1st included, extras add the upcharge)
            </label>
          </div>
        </div>
      ))}
      <div className="row mt" style={{ flexWrap: 'wrap' }}>
        {!hasGroup('Size') && <button className="btn ghost sm" onClick={() => addGroup('Size', 'YS, YM, YL, S, M, L, XL')}>+ Size</button>}
        {!hasGroup('Color') && <button className="btn ghost sm" onClick={() => addGroup('Color', 'Maroon, Gold, Black, White')}>+ Color</button>}
        {!hasGroup('Logo') && <button className="btn ghost sm" onClick={() => addGroup('Logo', 'Crest, Wordmark')}>+ Logo</button>}
        {!hasGroup('Placement') && <button className="btn ghost sm" onClick={() => addGroup('Placement', 'Left chest, Full front, Full back')}>+ Placement</button>}
        {!hasGroup('Front Print') && !hasGroup('Back Print') && <button className="btn ghost sm" onClick={addFrontBack}>+ Front &amp; Back print</button>}
        <button className="btn ghost sm" onClick={() => addGroup('', '')}>+ Custom option</button>
      </div>

      <PreviewSetup p={p} setP={setP} />

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

// ---- Live overlay preview setup (color photos + logo overlays + placement) ----
function PreviewSetup({ p, setP }) {
  const groups = parseGroups(p.options)
  const grp = (n) => groups.find((g) => g.name.toLowerCase() === n.toLowerCase())
  const colorGroup = grp('Color'), logoGroup = grp('Front Print') || grp('Logo') || grp('Front'), placementGroup = grp('Placement')

  const pv = p.preview || {}
  const colorImages = pv.colorImages || {}
  const logoImages = pv.logoImages || {}
  const placements = pv.placements || {}

  const [sel, setSel] = useState({})
  const [uploading, setUploading] = useState('')
  const [err, setErr] = useState('')

  const patch = (key, val) => setP((x) => ({ ...x, preview: { ...(x.preview || {}), [key]: val } }))

  if (!colorGroup && !logoGroup) {
    return <p className="hint mt">Add a <b>Color</b> and/or <b>Logo</b> option above to turn on the live overlay preview.</p>
  }

  const curColor = sel.color ?? colorGroup?.choices[0]
  // The logo picker offers the actual logos — "None" means no print, so it needs no image.
  const logoChoices = (logoGroup?.choices || []).filter((c) => String(c).toLowerCase() !== 'none')
  const curLogo = sel.logo ?? logoChoices[0]
  const curPlace = placementGroup ? (sel.placement ?? placementGroup.choices[0]) : null
  // Position + size are stored per (color × placement × logo) so each color positions the logo independently.
  const placeKey = placementKey(curColor, curPlace, curLogo)
  const coords = lookupPlacement(placements, curColor, curPlace, curLogo)

  const setCoord = (k, v) => patch('placements', { ...placements, [placeKey]: { ...coords, [k]: Number(v) } })

  async function up(file, kind) {
    if (!file) return
    setErr(''); setUploading(kind)
    try {
      const dataUrl = kind === 'logo' ? await resizePng(file, 700) : await resizeImage(file, 1000, 0.85)
      const { url } = await adminApi('upload_image', { data_url: dataUrl })
      if (kind === 'logo') patch('logoImages', { ...logoImages, [curLogo]: url })
      else patch('colorImages', { ...colorImages, [curColor]: url })
    } catch (e) { setErr('Upload failed: ' + e.message) } finally { setUploading('') }
  }

  return (
    <div className="admin-card" style={{ background: '#faf8f8', marginTop: 12 }}>
      <b>Live preview — color + logo overlay</b>
      <p className="hint">Upload a garment photo for each color and a transparent logo for each logo choice, then position the logo with the sliders. Shoppers see this composite update live as they choose.</p>
      <div className="two-col">
        <div style={{ maxWidth: 280, margin: '0 auto', width: '100%' }}>
          <PreviewImage base={(curColor && colorImages[curColor]) || ''} logo={(curLogo && logoImages[curLogo]) || null} placement={coords} />
        </div>
        <div>
          {colorGroup && (
            <>
              <label className="field">Color</label>
              <select value={curColor} onChange={(e) => setSel((s) => ({ ...s, color: e.target.value }))}>
                {colorGroup.choices.map((c) => <option key={c} value={c}>{c}{colorImages[c] ? '  ✓' : ''}</option>)}
              </select>
              <label className="btn ghost sm mt" style={{ cursor: uploading ? 'default' : 'pointer', display: 'inline-block' }}>
                {uploading === 'color' ? 'Uploading…' : `📷 Photo for “${curColor}”`}
                <input type="file" accept="image/*" hidden disabled={!!uploading} onChange={(e) => up(e.target.files?.[0], 'color')} />
              </label>
            </>
          )}
          {logoGroup && (
            <>
              <label className="field mt">Logo</label>
              <select value={curLogo || ''} onChange={(e) => setSel((s) => ({ ...s, logo: e.target.value }))}>
                {logoChoices.map((c) => <option key={c} value={c}>{c}{logoImages[c] ? '  ✓' : ''}</option>)}
              </select>
              <label className="btn ghost sm mt" style={{ cursor: uploading ? 'default' : 'pointer', display: 'inline-block' }}>
                {uploading === 'logo' ? 'Uploading…' : `🅻 Logo for “${curLogo}” (transparent PNG)`}
                <input type="file" accept="image/*" hidden disabled={!!uploading} onChange={(e) => up(e.target.files?.[0], 'logo')} />
              </label>

              {placementGroup && (
                <>
                  <label className="field mt">Placement</label>
                  <select value={curPlace} onChange={(e) => setSel((s) => ({ ...s, placement: e.target.value }))}>
                    {placementGroup.choices.map((c) => <option key={c} value={c}>{c}{placements[c] ? '  ✓' : ''}</option>)}
                  </select>
                </>
              )}
              <label className="field mt">Position &amp; size — {curColor} · {curLogo}{placementGroup ? ` · ${curPlace}` : ''}</label>
              <p className="hint" style={{ margin: '2px 0 0' }}>Set per <b>color</b> (and logo{placementGroup ? '/placement' : ''}). Switch the Color above to position the logo on each color’s photo.</p>
              <div className="slider-row"><span>Left ↔ Right</span><input type="range" min="0" max="1" step="0.01" value={coords.x} onChange={(e) => setCoord('x', e.target.value)} /></div>
              <div className="slider-row"><span>Top ↕ Bottom</span><input type="range" min="0" max="1" step="0.01" value={coords.y} onChange={(e) => setCoord('y', e.target.value)} /></div>
              <div className="slider-row"><span>Size</span><input type="range" min="0.05" max="1" step="0.01" value={coords.w} onChange={(e) => setCoord('w', e.target.value)} /></div>
            </>
          )}
          {err && <div className="err mt">{err}</div>}
        </div>
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
          order_deadline: s.order_deadline || null,
          orders_closed: !!s.orders_closed,
          banner_open: s.banner_open || '',
          banner_closed: s.banner_closed || '',
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

      <h3 style={{ margin: '20px 0 4px' }}>Ordering window</h3>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '6px 0' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!s.orders_closed} onChange={(e) => set('orders_closed', e.target.checked)} />
        <b>Close ordering now</b> — buyers can still browse, but can’t order
      </label>

      <label className="field">Order deadline (optional — auto-closes after this day; leave blank for none)</label>
      <input type="date" value={s.order_deadline || ''} onChange={(e) => set('order_deadline', e.target.value)} />

      <label className="field">Banner while OPEN (blank = auto “Orders close …”. Type <code>{'{date}'}</code> to insert the deadline)</label>
      <input value={s.banner_open || ''} onChange={(e) => set('banner_open', e.target.value)} placeholder="🗓️ Orders close {date} — get yours in before then!" />

      <label className="field">Banner while CLOSED</label>
      <input value={s.banner_closed || ''} onChange={(e) => set('banner_closed', e.target.value)} placeholder="🚫 Ordering is closed — next window opens soon!" />
      <p className="hint">Leave a banner blank to use the default wording. Edit these anytime you open or close a round.</p>

      {err && <div className="err mt">{err}</div>}
      {msg && <div className="mt" style={{ color: 'var(--accent-dark)', fontWeight: 700 }}>{msg}</div>}
      <button className="btn mt" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </div>
  )
}
