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
          .select('*, product_variants(*)')
          .order('sort_order')
        if (error) throw error
        return res.json({ products: data })
      }

      case 'save_product': {
        const p = body.product
        if (!p?.name?.trim()) return res.status(400).json({ error: 'Name required.' })
        let productId = p.id

        if (productId) {
          const { error } = await admin.from('products').update({
            name: p.name, description: p.description, price_cents: p.price_cents,
            image_url: p.image_url, active: p.active, sort_order: p.sort_order,
          }).eq('id', productId)
          if (error) throw error
        } else {
          const { data, error } = await admin.from('products').insert({
            name: p.name, description: p.description, price_cents: p.price_cents,
            image_url: p.image_url, active: p.active, sort_order: p.sort_order,
          }).select().single()
          if (error) throw error
          productId = data.id
        }

        // Sync variants: update existing, insert new, delete removed.
        const incoming = p.variants || []
        const keepIds = incoming.filter((v) => v.id).map((v) => v.id)
        const { data: existing } = await admin.from('product_variants').select('id').eq('product_id', productId)
        const toDelete = (existing || []).map((v) => v.id).filter((id) => !keepIds.includes(id))
        if (toDelete.length) await admin.from('product_variants').delete().in('id', toDelete)

        for (const v of incoming) {
          if (v.id) {
            await admin.from('product_variants').update({ size_label: v.size_label, stock: v.stock, sort_order: v.sort_order }).eq('id', v.id)
          } else {
            await admin.from('product_variants').insert({ product_id: productId, size_label: v.size_label, stock: v.stock, sort_order: v.sort_order })
          }
        }
        return res.json({ ok: true, id: productId })
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
