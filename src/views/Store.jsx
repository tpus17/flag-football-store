import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import {
  money, loadCart, saveCart, cartCount, cartTotalCents,
  placeOrder, venmoLink,
} from '../lib'

export default function Store({ settings }) {
  const [products, setProducts] = useState(null)
  const [cart, setCart] = useState(loadCart())
  const [open, setOpen] = useState(false)

  useEffect(() => { saveCart(cart) }, [cart])

  async function load() {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, price_cents, image_url, sort_order, product_variants(id, size_label, stock, sort_order)')
      .eq('active', true)
      .order('sort_order')
    if (error) { console.error(error); setProducts([]); return }
    const list = (data || []).map((p) => ({
      ...p,
      product_variants: [...(p.product_variants || [])].sort((a, b) => a.sort_order - b.sort_order),
    }))
    setProducts(list)
  }
  useEffect(() => { load() }, [])

  function addToCart(product, variant) {
    setCart((prev) => {
      const key = `${product.id}:${variant.id}`
      const existing = prev.find((i) => i.key === key)
      if (existing) {
        if (existing.qty >= variant.stock) return prev
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, {
        key,
        product_id: product.id,
        variant_id: variant.id,
        product_name: product.name,
        size_label: variant.size_label,
        unit_price_cents: product.price_cents,
        qty: 1,
        max_stock: variant.stock,
      }]
    })
    setOpen(true)
  }

  const setQty = (key, qty) =>
    setCart((prev) => prev.flatMap((i) => {
      if (i.key !== key) return [i]
      const q = Math.max(0, Math.min(qty, i.max_stock))
      return q === 0 ? [] : [{ ...i, qty: q }]
    }))

  const count = cartCount(cart)

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
              <ProductCard key={p.id} product={p} onAdd={addToCart} />
            ))}
          </div>
        )}
      </div>

      <div className="footer">
        {settings?.team_name || 'C-Side Flag Football'} · Thanks for supporting our team!
      </div>

      {open && (
        <CartDrawer
          cart={cart}
          settings={settings}
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

function ProductCard({ product, onAdd }) {
  const variants = product.product_variants || []
  const inStock = variants.filter((v) => v.stock > 0)
  const hasRealSizes = !(variants.length === 1 && variants[0].size_label === 'One Size')
  const [sel, setSel] = useState(inStock[0]?.id || variants[0]?.id || null)
  const selVariant = variants.find((v) => v.id === sel)
  const soldOut = inStock.length === 0

  return (
    <div className="card">
      <div className="card-img">
        {product.image_url ? <img src={product.image_url} alt={product.name} /> : '👕'}
      </div>
      <div className="card-body">
        <h3>{product.name}</h3>
        {product.description && <p className="card-desc">{product.description}</p>}
        <div className="price">{money(product.price_cents)}</div>

        {hasRealSizes && (
          <div className="sizes">
            {variants.map((v) => (
              <button
                key={v.id}
                className={`size-pill ${sel === v.id ? 'active' : ''}`}
                disabled={v.stock <= 0}
                onClick={() => setSel(v.id)}
                title={v.stock <= 0 ? 'Sold out' : `${v.stock} left`}
              >
                {v.size_label}
              </button>
            ))}
          </div>
        )}

        {soldOut ? (
          <div className="soldout">Sold out</div>
        ) : (
          <>
            <button
              className="btn block"
              disabled={!selVariant || selVariant.stock <= 0}
              onClick={() => onAdd(product, selVariant)}
            >
              Add to cart
            </button>
            {selVariant && selVariant.stock <= 5 && (
              <div className="stock-note">Only {selVariant.stock} left{hasRealSizes ? ` in ${selVariant.size_label}` : ''}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CartDrawer({ cart, settings, onClose, setQty, onOrdered, reload }) {
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
    if (!form.buyer_name.trim()) return setErr('Please enter your name.')
    if (!form.buyer_contact.trim()) return setErr('Please enter a phone or email so we can reach you.')
    setBusy(true)
    try {
      const payload = {
        ...form,
        items: cart.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
      }
      const res = await placeOrder(payload)
      setConfirmation({ order: res.order, total })
      onOrdered()
      reload()
      setStage('done')
    } catch (e) {
      setErr(e.message)
      reload() // stock may have changed
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
                      <small>{i.size_label !== 'One Size' ? `Size ${i.size_label} · ` : ''}{money(i.unit_price_cents)} each</small>
                    </div>
                    <div className="qtybox">
                      <button onClick={() => setQty(i.key, i.qty - 1)}>−</button>
                      <span>{i.qty}</span>
                      <button onClick={() => setQty(i.key, i.qty + 1)} disabled={i.qty >= i.max_stock}>+</button>
                    </div>
                  </div>
                ))}
                <div className="summary">
                  <div className="total"><span>Total</span><span>{money(total)}</span></div>
                </div>
                <button className="btn block" onClick={() => setStage('checkout')}>Continue to checkout</button>
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
