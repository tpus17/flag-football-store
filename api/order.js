/*
 * POST /api/order      → place an order (validates prices + stock server-side).
 * GET  /api/order?stats=1 → public fundraising total (paid orders only).
 */
import { admin, readBody } from './_lib.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (req.query?.stats) {
      const { data, error } = await admin.from('orders').select('total_cents').eq('paid', true)
      if (error) return res.status(500).json({ error: error.message })
      const raised = (data || []).reduce((n, o) => n + (o.total_cents || 0), 0)
      return res.status(200).json({ raised_cents: raised })
    }
    return res.status(400).json({ error: 'Missing ?stats=1' })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = await readBody(req)
  const { buyer_name, buyer_contact, contact_type, payment_method, note, items } = body || {}

  if (!buyer_name?.trim() || !buyer_contact?.trim())
    return res.status(400).json({ error: 'Name and contact are required.' })
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Your cart is empty.' })
  if (!['venmo', 'zelle', 'cash'].includes(payment_method))
    return res.status(400).json({ error: 'Invalid payment method.' })

  // Collapse duplicate variant lines and validate quantities.
  const wanted = new Map()
  for (const it of items) {
    const qty = Math.floor(Number(it.qty))
    if (!it.variant_id || !Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ error: 'Invalid cart item.' })
    wanted.set(it.variant_id, (wanted.get(it.variant_id) || 0) + qty)
  }

  // Look up authoritative prices + product names from the DB (never trust the client).
  const variantIds = [...wanted.keys()]
  const { data: variants, error: vErr } = await admin
    .from('product_variants')
    .select('id, size_label, stock, product_id, products(name, price_cents, active)')
    .in('id', variantIds)
  if (vErr) return res.status(500).json({ error: vErr.message })
  if (!variants || variants.length !== variantIds.length)
    return res.status(400).json({ error: 'Some items are no longer available.' })

  const lines = []
  let total = 0
  for (const v of variants) {
    const qty = wanted.get(v.id)
    if (!v.products?.active) return res.status(400).json({ error: `"${v.products?.name || 'An item'}" is no longer available.` })
    if (v.stock < qty) return res.status(409).json({ error: `Not enough stock for ${v.products.name} (${v.size_label}). Only ${v.stock} left.` })
    const unit = v.products.price_cents
    total += unit * qty
    lines.push({ variant_id: v.id, product_id: v.product_id, product_name: v.products.name, size_label: v.size_label, unit_price_cents: unit, qty })
  }

  // Decrement stock atomically per variant; roll back on any failure.
  const done = []
  for (const l of lines) {
    const { data: ok, error } = await admin.rpc('decrement_stock', { p_variant_id: l.variant_id, p_qty: l.qty })
    if (error || !ok) {
      for (const d of done) await admin.rpc('decrement_stock', { p_variant_id: d.variant_id, p_qty: -d.qty })
      return res.status(409).json({ error: `Sorry, ${l.product_name} (${l.size_label}) just sold out. Please adjust your cart.` })
    }
    done.push(l)
  }

  // Create the order.
  const { data: order, error: oErr } = await admin.from('orders').insert({
    buyer_name: buyer_name.trim(),
    buyer_contact: buyer_contact.trim(),
    contact_type: contact_type === 'email' ? 'email' : 'phone',
    payment_method,
    note: (note || '').slice(0, 500),
    total_cents: total,
  }).select().single()

  if (oErr) {
    for (const d of done) await admin.rpc('decrement_stock', { p_variant_id: d.variant_id, p_qty: -d.qty })
    return res.status(500).json({ error: 'Could not save order. Please try again.' })
  }

  const itemRows = lines.map((l) => ({ ...l, order_id: order.id }))
  const { error: iErr } = await admin.from('order_items').insert(itemRows)
  if (iErr) return res.status(500).json({ error: 'Order saved but items failed — please contact the store.' })

  return res.status(200).json({ ok: true, order: { id: order.id, total_cents: total } })
}
