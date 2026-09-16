/*
 * POST /api/admin — all admin actions, gated by ADMIN_PASSCODE.
 * body: { passcode, action, ...payload }
 */
import { admin, readBody, requireAdmin } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const body = await readBody(req)
  if (!requireAdmin(body, res)) return

  const { action } = body
  try {
    switch (action) {
      case 'stats': {
        const { data, error } = await admin.from('orders').select('total_cents, paid')
        if (error) throw error
        const { data: items, error: iErr } = await admin.from('order_items').select('qty')
        if (iErr) throw iErr
        const paid = data.filter((o) => o.paid)
        return res.json({
          order_count: data.length,
          paid_cents: paid.reduce((n, o) => n + o.total_cents, 0),
          pending_cents: data.filter((o) => !o.paid).reduce((n, o) => n + o.total_cents, 0),
          items_sold: items.reduce((n, i) => n + i.qty, 0),
        })
      }

      case 'list_orders': {
        const { data, error } = await admin
          .from('orders')
          .select('*, order_items(*)')
          .order('created_at', { ascending: false })
        if (error) throw error
        return res.json({ orders: data })
      }

      case 'update_order': {
        const patch = {}
        if (typeof body.paid === 'boolean') patch.paid = body.paid
        if (typeof body.fulfilled === 'boolean') patch.fulfilled = body.fulfilled
        const { error } = await admin.from('orders').update(patch).eq('id', body.id)
        if (error) throw error
        return res.json({ ok: true })
      }

      case 'delete_order': {
        const { error } = await admin.from('orders').delete().eq('id', body.id)
        if (error) throw error
        return res.json({ ok: true })
      }

      case 'list_products': {
        const { data, error } = await admin
          .from('products')
          .select('*')
          .order('sort_order')
        if (error) throw error
        return res.json({ products: data })
      }

      case 'save_product': {
        const p = body.product
        if (!p?.name?.trim()) return res.status(400).json({ error: 'Name required.' })

        const images = Array.isArray(p.images) ? p.images.filter((u) => typeof u === 'string' && u) : []
        const cover = images[0] || p.image_url || ''
        const options = (Array.isArray(p.options) ? p.options : [])
          .map((g) => ({
            name: String(g?.name || '').trim(),
            choices: (Array.isArray(g?.choices) ? g.choices : []).map((c) => String(c).trim()).filter(Boolean),
            upcharge: Math.max(0, Math.round(Number(g?.upcharge) || 0)),
          }))
          .filter((g) => g.name && g.choices.length)
        const rawPv = (p.preview && typeof p.preview === 'object') ? p.preview : {}
        const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}
        const preview = {
          colorImages: obj(rawPv.colorImages),
          logoImages: obj(rawPv.logoImages),
          placements: obj(rawPv.placements),
        }
        const fields = {
          name: p.name.trim(), description: p.description || '', price_cents: p.price_cents,
          image_url: cover, images, options, preview, active: p.active, sort_order: p.sort_order,
        }

        if (p.id) {
          const { error } = await admin.from('products').update(fields).eq('id', p.id)
          if (error) throw error
          return res.json({ ok: true, id: p.id })
        }
        const { data, error } = await admin.from('products').insert(fields).select().single()
        if (error) throw error
        return res.json({ ok: true, id: data.id })
      }

      case 'upload_image': {
        const dataUrl = body.data_url || ''
        const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
        if (!m) return res.status(400).json({ error: 'No valid image provided.' })
        const contentType = m[1]
        const buffer = Buffer.from(m[2], 'base64')
        if (buffer.length > 4_000_000) return res.status(413).json({ error: 'Image too large — please use a smaller photo.' })
        // Ensure the public bucket exists (no-op if it already does).
        await admin.storage.createBucket('product-images', { public: true }).catch(() => {})
        const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('+xml', '')
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await admin.storage.from('product-images').upload(path, buffer, { contentType, upsert: false })
        if (upErr) return res.status(500).json({ error: upErr.message })
        const { data: pub } = admin.storage.from('product-images').getPublicUrl(path)
        return res.json({ ok: true, url: pub.publicUrl })
      }

      case 'delete_product': {
        const { error } = await admin.from('products').delete().eq('id', body.id)
        if (error) throw error
        return res.json({ ok: true })
      }

      case 'save_settings': {
        const s = body.settings || {}
        const { error } = await admin.from('store_settings').update({
          team_name: s.team_name, tagline: s.tagline,
          venmo_handle: s.venmo_handle, zelle_info: s.zelle_info, cash_info: s.cash_info,
          pickup_info: s.pickup_info, accent_color: s.accent_color,
          fundraiser_goal_cents: s.fundraiser_goal_cents, updated_at: new Date().toISOString(),
        }).eq('id', 1)
        if (error) throw error
        return res.json({ ok: true })
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' })
  }
}
