/*
 * POST /api/order      → place an order (validates prices server-side).
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

  // Collapse duplicate lines (same product + same chosen options) and validate quantities.
  const wanted = new Map()
  for (const it of items) {
    const qty = Math.floor(Number(it.qty))
    if (!it.product_id || !Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ error: 'Invalid cart item.' })
    const opts = (it.options && typeof it.options === 'object') ? it.options : {}
    const key = `${it.product_id}|${JSON.stringify(opts)}`
    const ex = wanted.get(key)
    if (ex) ex.qty += qty
    else wanted.set(key, { product_id: it.product_id, options: opts, qty })
  }

  // Look up authoritative prices + names from the DB (never trust the client).
  const productIds = [...new Set([...wanted.values()].map((w) => w.product_id))]
  const { data: products, error: pErr } = await admin
    .from('products')
    .select('id, name, price_cents, active, options')
    .in('id', productIds)
  if (pErr) return res.status(500).json({ error: pErr.message })
  const byId = Object.fromEntries((products || []).map((p) => [p.id, p]))

  const lines = []
  let total = 0
  for (const w of wanted.values()) {
    const prod = byId[w.product_id]
    if (!prod) return res.status(400).json({ error: 'Some items are no longer available.' })
    if (!prod.active) return res.status(400).json({ error: `"${prod.name}" is no longer available.` })
    // Build an option summary in the product's own group order, keeping only valid choices.
    const groups = Array.isArray(prod.options) ? prod.options : []
    const cleanOpts = {}
    const parts = []
    for (const g of groups) {
      const val = w.options[g?.name]
      if (val && Array.isArray(g.choices) && g.choices.includes(val) && val.toLowerCase() !== 'none') {
        cleanOpts[g.name] = val; parts.push(val)
      }
    }
    total += prod.price_cents * w.qty
    lines.push({ product_id: prod.id, product_name: prod.name, size_label: parts.join(' · '), options: cleanOpts, unit_price_cents: prod.price_cents, qty: w.qty })
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

  if (oErr) return res.status(500).json({ error: 'Could not save order. Please try again.' })

  const itemRows = lines.map((l) => ({ ...l, order_id: order.id }))
  const { error: iErr } = await admin.from('order_items').insert(itemRows)
  if (iErr) return res.status(500).json({ error: 'Order saved but items failed — please contact the store.' })

  // Notify the store owner by email (non-fatal — the order still succeeds if this fails).
  try {
    await sendOrderEmail({ order, lines, buyer_name, buyer_contact, contact_type, payment_method, note, total })
  } catch (e) {
    console.error('Order notification email failed:', e.message)
  }

  return res.status(200).json({ ok: true, order: { id: order.id, total_cents: total } })
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const usd = (c) => '$' + (Number(c || 0) / 100).toFixed(2)

// Send an order-details email via Resend (https://resend.com). No-ops if RESEND_API_KEY
// isn't configured yet, so orders keep working before email is set up.
async function sendOrderEmail({ order, lines, buyer_name, buyer_contact, contact_type, payment_method, note, total }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const to = process.env.ORDER_NOTIFY_EMAIL || 'tom@topteamscore.com'
  const from = process.env.ORDER_FROM_EMAIL || 'C-Side Flag Football <orders@ludivation.com>'

  const rows = lines.map((l) => {
    const opts = Object.entries(l.options || {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(', ') || esc(l.size_label || '')
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap">${l.qty}×</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee"><b>${esc(l.product_name)}</b>${opts ? `<br><span style="color:#666;font-size:13px">${opts}</span>` : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${usd(l.unit_price_cents * l.qty)}</td>
    </tr>`
  }).join('')

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#201618">
    <div style="background:#7a1d2b;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;border-bottom:3px solid #c8a13c">
      <b style="font-size:18px">New C-Side Flag Football order</b>
    </div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:18px">
      <p style="margin:0 0 4px"><b>${esc(buyer_name)}</b></p>
      <p style="margin:0 0 2px;color:#555">${contact_type === 'email' ? 'Email' : 'Phone'}: ${esc(buyer_contact)}</p>
      <p style="margin:0 0 2px;color:#555">Paying by: <b style="text-transform:capitalize">${esc(payment_method)}</b></p>
      ${note ? `<p style="margin:8px 0 0;color:#555">Note: “${esc(note)}”</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin-top:14px">${rows}
        <tr><td></td><td style="padding:10px;text-align:right;font-weight:800">Total</td>
        <td style="padding:10px;text-align:right;font-weight:800">${usd(total)}</td></tr>
      </table>
      <p style="margin:16px 0 0;color:#999;font-size:12px">Order ${esc(order.id)} · ${new Date(order.created_at || Date.now()).toLocaleString('en-US')}</p>
    </div>
  </div>`

  const payload = {
    from, to,
    subject: `New order — ${buyer_name} (${usd(total)})`,
    html,
  }
  if (contact_type === 'email' && buyer_contact.includes('@')) payload.reply_to = buyer_contact.trim()

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`)
}
