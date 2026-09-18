import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { PreviewImage, lookupPlacement } from '../Preview.jsx'
import {
  money, loadCart, saveCart, cartCount, cartTotalCents,
  placeOrder, venmoLink, computePricing,
} from '../lib'

// Format a 'YYYY-MM-DD' deadline as e.g. "October 15" in local time.
function formatDeadline(d) {
  const [y, m, day] = String(d).split('-').map(Number)
  if (!y || !m || !day) return d
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

export default function Store({ settings }) {
  const [products, setProducts] = useState(null)
  const [cart, setCart] = useState(loadCart())
  const [open, setOpen] = useState(false)

  useEffect(() => { saveCart(cart) }, [cart])

  async function load() {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, price_cents, image_url, images, options, preview, sort_order')
      .eq('active', true)
      .order('sort_order')
    if (error) { console.error(error); setProducts([]); return }
    setProducts(data || [])
  }
  useEffect(() => { load() }, [])

  function addToCart(product, selection, optionsText, unitPriceCents) {
    setCart((prev) => {
      const key = `${product.id}:${optionsText}`
      const existing = prev.find((i) => i.key === key)
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, {
        key,
        product_id: product.id,
        product_name: product.name,
        options: selection,
        options_text: optionsText,
        unit_price_cents: unitPriceCents ?? product.price_cents,
        qty: 1,
      }]
    })
    setOpen(true)
  }

  const setQty = (key, qty) =>
    setCart((prev) => prev.flatMap((i) => {
      if (i.key !== key) return [i]
      const q = Math.max(0, qty)
      return q === 0 ? [] : [{ ...i, qty: q }]
    }))

  const count = cartCount(cart)
  const deadline = settings?.order_deadline || null
  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
  const pastDeadline = deadline ? todayStr > deadline : false
  const closed = !!settings?.orders_closed || pastDeadline

  const fillDate = (t) => String(t).replace(/\{date\}/gi, deadline ? formatDeadline(deadline) : '')
  const bannerText = closed
    ? (settings?.banner_closed?.trim() || '🚫 Ordering has closed — thank you!')
    : (settings?.banner_open?.trim()
        ? fillDate(settings.banner_open)
        : (deadline ? `🗓️ Orders close ${formatDeadline(deadline)} — get yours in before then!` : ''))

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <img className="brand-logo" src="/logo-mark.png" alt="C-Side Flag Football logo" />
          <div className="brand">
            {settings?.team_name || 'C-Side Flag Football'}
            <small>Team Store</small>
          </div>
          <div className="spacer" />
          <button className="cart-btn" onClick={() => setOpen(true)}>
            🛒 Cart {count > 0 && <span className="badge">{count}</span>}
          </button>
        </div>
      </header>

      {bannerText && (
        <div className={`deadline-banner ${closed ? 'closed' : ''}`}>{bannerText}</div>
      )}

      <div className="hero">
        <img className="hero-logo" src="/logo-mark.png" alt="C-Side Flag Football" />
        <p className="hero-tag">{settings?.tagline || 'Every purchase supports the team!'}</p>
        <GoalBar settings={settings} />
      </div>

      <div className="wrap">
        {products === null ? (
          <p className="empty">Loading store…</p>
        ) : products.length === 0 ? (
          <p className="empty">No products yet — check back soon!</p>
        ) : (
          <div className="grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={addToCart} closed={closed} />
            ))}
          </div>
        )}
      </div>

      <div className="footer">
        <div>{settings?.team_name || 'C-Side Flag Football'} · Thanks for supporting our team!</div>
        <div className="footer-links"><a href="#/admin">Admin</a></div>
      </div>

      {open && (
        <CartDrawer
          cart={cart}
          settings={settings}
          closed={closed}
          onClose={() => setOpen(false)}
          setQty={setQty}
          onOrdered={() => { setCart([]); }}
          reload={load}
        />
      )}
    </>
  )
}

function GoalBar({ settings }) {
  const goal = settings?.fundraiser_goal_cents || 0
  const [raised, setRaised] = useState(null)
  useEffect(() => {
    if (!goal) return
    // Public can't read orders; a lightweight public total comes from /api.
    fetch('/api/order?stats=1')
      .then((r) => r.json())
      .then((d) => setRaised(d.raised_cents ?? 0))
      .catch(() => setRaised(null))
  }, [goal])
  if (!goal) return null
  const pct = raised == null ? 0 : Math.min(100, Math.round((raised / goal) * 100))
  return (
    <div className="goal">
      <div className="goal-bar"><div className="goal-fill" style={{ width: `${pct}%` }} /></div>
      <div className="goal-text">
        {raised == null ? 'Fundraising goal ' : `${money(raised)} raised of `}
        {money(goal)}{raised != null && ` (${pct}%)`}
      </div>
    </div>
  )
}

function Carousel({ images, alt }) {
  const [idx, setIdx] = useState(0)
  const touchX = useRef(null)
  if (!images.length) return <div className="card-img">👕</div>
  const n = images.length
  const go = (d) => setIdx((i) => (i + d + n) % n)
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
    touchX.current = null
  }
  return (
    <div className="card-img carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <img src={images[Math.min(idx, n - 1)]} alt={alt} />
      {n > 1 && (
        <>
          <button className="car-btn prev" onClick={() => go(-1)} aria-label="Previous image">‹</button>
          <button className="car-btn next" onClick={() => go(1)} aria-label="Next image">›</button>
          <div className="car-dots">
            {images.map((_, i) => (
              <span key={i} className={`car-dot ${i === idx ? 'on' : ''}`} onClick={() => setIdx(i)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ProductCard({ product, onAdd, closed }) {
  const groups = (Array.isArray(product.options) ? product.options : [])
    .filter((g) => g && g.name && Array.isArray(g.choices) && g.choices.length)
  const [sel, setSel] = useState(() => Object.fromEntries(groups.map((g) => [g.name, g.choices[0]])))

  const images = (Array.isArray(product.images) && product.images.length ? product.images
    : (product.image_url ? [product.image_url] : []))
  const optionsText = groups.map((g) => sel[g.name]).filter(Boolean).join(' · ')

  // Live overlay preview: base garment (by Color) + the FRONT logo at its placement.
  const pv = product.preview || {}
  const colorImgs = pv.colorImages || {}
  const logoImgs = pv.logoImages || {}
  const frontName = ['Front Print', 'Logo', 'Front'].find((n) => groups.some((g) => g.name === n))
  const frontVal = frontName ? sel[frontName] : undefined
  const base = colorImgs[sel['Color']] || images[0] || ''
  const logo = (frontVal && frontVal.toLowerCase() !== 'none' && logoImgs[frontVal]) || null
  const place = lookupPlacement(pv.placements, sel['Color'], sel['Placement'], frontVal)
  const usePreview = (Object.keys(colorImgs).length > 0 || Object.keys(logoImgs).length > 0) && base

  const { unitCents: unitPrice, applied: activeUpcharges } = computePricing(product.price_cents, groups, sel)

  return (
    <div className="card">
      {usePreview
        ? <PreviewImage base={base} logo={logo} placement={place} alt={product.name} />
        : <Carousel images={images} alt={product.name} />}
      <div className="card-body">
        <h3>{product.name}</h3>
        {product.description && <p className="card-desc">{product.description}</p>}
        <div className="price">{money(unitPrice)}</div>
        {activeUpcharges.length > 0 && (
          <div className="stock-note">includes {activeUpcharges.map((u) => `+${money(u.cents)} ${u.name}`).join(', ')}</div>
        )}

        {groups.map((g) => (
          <div className="opt-group" key={g.name}>
            <div className="opt-label">{g.name}{!g.print && Number(g.upcharge) > 0 ? ` (+${money(g.upcharge)})` : ''}</div>
            <select
              value={sel[g.name] || ''}
              onChange={(e) => setSel((s) => ({ ...s, [g.name]: e.target.value }))}
            >
              {g.choices.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ))}

        <button className="btn block" disabled={closed} onClick={() => onAdd(product, sel, optionsText, unitPrice)}>
          {closed ? 'Ordering closed' : 'Add to cart'}
        </button>
      </div>
    </div>
  )
}

function CartDrawer({ cart, settings, closed, onClose, setQty, onOrdered, reload }) {
  const [stage, setStage] = useState('cart') // cart | checkout | done
  const [form, setForm] = useState({
    buyer_name: '', buyer_contact: '', contact_type: 'phone',
    payment_method: 'venmo', note: '',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState(null)

  const total = cartTotalCents(cart)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    setErr('')
    if (closed) return setErr('Ordering has closed for this store.')
    if (!form.buyer_name.trim()) return setErr('Please enter your name.')
    if (!form.buyer_contact.trim()) return setErr('Please enter a phone or email so we can reach you.')
    setBusy(true)
    try {
      const payload = {
        ...form,
        items: cart.map((i) => ({ product_id: i.product_id, options: i.options, qty: i.qty })),
      }
      const res = await placeOrder(payload)
      setConfirmation({ order: res.order, total })
      onOrdered()
      reload()
      setStage('done')
    } catch (e) {
      setErr(e.message)
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <h2>{stage === 'done' ? 'Order placed!' : stage === 'checkout' ? 'Checkout' : 'Your cart'}</h2>
          <button className="x" onClick={onClose}>×</button>
        </div>

        {stage === 'cart' && (
          <>
            {cart.length === 0 ? (
              <p className="empty">Your cart is empty.</p>
            ) : (
              <>
                {cart.map((i) => (
                  <div className="line" key={i.key}>
                    <div className="meta">
                      <b>{i.product_name}</b>
                      <small>{i.options_text ? `${i.options_text} · ` : ''}{money(i.unit_price_cents)} each</small>
                    </div>
                    <div className="qtybox">
                      <button onClick={() => setQty(i.key, i.qty - 1)}>−</button>
                      <span>{i.qty}</span>
                      <button onClick={() => setQty(i.key, i.qty + 1)}>+</button>
                    </div>
                  </div>
                ))}
                <div className="summary">
                  <div className="total"><span>Total</span><span>{money(total)}</span></div>
                </div>
                {closed
                  ? <div className="err">Ordering has closed for this store.</div>
                  : <button className="btn block" onClick={() => setStage('checkout')}>Continue to checkout</button>}
              </>
            )}
          </>
        )}

        {stage === 'checkout' && (
          <>
            <label className="field">Your name</label>
            <input value={form.buyer_name} onChange={(e) => set('buyer_name', e.target.value)} placeholder="Jane Smith" />

            <label className="field">How should we reach you?</label>
            <div className="row">
              <select style={{ width: 120 }} value={form.contact_type} onChange={(e) => set('contact_type', e.target.value)}>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
              </select>
              <input
                value={form.buyer_contact}
                onChange={(e) => set('buyer_contact', e.target.value)}
                placeholder={form.contact_type === 'phone' ? '555-123-4567' : 'you@email.com'}
                type={form.contact_type === 'email' ? 'email' : 'tel'}
              />
            </div>

            <label className="field">How will you pay?</label>
            <div className="pay-methods">
              {['venmo', 'zelle', 'cash'].map((m) => (
                <div
                  key={m}
                  className={`size-pill ${form.payment_method === m ? 'active' : ''}`}
                  onClick={() => set('payment_method', m)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {m}
                </div>
              ))}
            </div>
            <p className="hint">You'll get payment instructions on the next screen. Orders are confirmed once payment is received.</p>

            <label className="field">Note (optional)</label>
            <textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Player name, pickup preference, etc." />

            {err && <div className="err mt">{err}</div>}

            <div className="summary mt">
              <div className="total"><span>Total</span><span>{money(total)}</span></div>
            </div>
            <button className="btn block" onClick={submit} disabled={busy}>
              {busy ? 'Placing order…' : `Place order · ${money(total)}`}
            </button>
            <button className="btn ghost block mt" onClick={() => setStage('cart')} disabled={busy}>Back to cart</button>
          </>
        )}

        {stage === 'done' && confirmation && (
          <Confirmation settings={settings} confirmation={confirmation} method={form.payment_method} />
        )}
      </div>
    </div>
  )
}

function Confirmation({ settings, confirmation, method }) {
  const { order, total } = confirmation
  const note = `${settings?.team_name || 'Team'} store order ${order?.id?.slice(0, 8) || ''}`
  const vlink = venmoLink(settings?.venmo_handle, total, note)

  return (
    <div className="ok-box">
      <img className="confirm-logo" src="/logo-mark.png" alt="C-Side Flag Football" />
      <p className="confirm-check">✅ <b>Thank you, your order is in!</b></p>
      <p className="muted">Order total: <b>{money(total)}</b></p>

      <div className="pay-box mt">
        <b>Next: send your payment</b>
        {method === 'venmo' && (
          <p>
            {settings?.venmo_handle
              ? <>Pay <code>@{settings.venmo_handle.replace(/^@/, '')}</code> on Venmo{vlink && <> — <a href={vlink} target="_blank" rel="noreferrer">tap to open Venmo</a></>}.</>
              : 'Venmo details will be sent to you.'}
          </p>
        )}
        {method === 'zelle' && (
          <p>{settings?.zelle_info ? <>Send via Zelle to <code>{settings.zelle_info}</code>.</> : 'Zelle details will be sent to you.'}</p>
        )}
        {method === 'cash' && <p>{settings?.cash_info || 'Pay in cash at pickup.'}</p>}
        <p className="hint">Please include your name so we can match your payment to your order.</p>
      </div>

      {settings?.pickup_info && (
        <div className="pay-box mt"><b>Pickup</b><p>{settings.pickup_info}</p></div>
      )}
    </div>
  )
}
