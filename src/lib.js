/* Small shared helpers: money formatting, cart storage, admin API calls. */

export const money = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const dollarsToCents = (v) => Math.round(Number(v || 0) * 100)

// Compute a unit price from a base + option groups + the shopper's selection.
// "print"-flagged groups (e.g. Front Print / Back Print): the FIRST selected print
// (choice other than "None") is included in the base; each ADDITIONAL print adds its
// upcharge — so front-only or back-only stays at base, both adds the charge.
// Non-print groups add their upcharge whenever a non-"None" choice is selected.
// The server recomputes this identically at checkout, so it can't be tampered with.
export function computePricing(baseCents, groups, sel) {
  let unit = Number(baseCents) || 0
  let prints = 0
  const applied = []
  for (const g of (groups || [])) {
    const val = sel?.[g.name]
    if (!val) continue
    if (Array.isArray(g.choices) && !g.choices.includes(val)) continue
    if (String(val).toLowerCase() === 'none') continue
    const up = Math.round(Number(g.upcharge) || 0)
    if (g.print) {
      prints += 1
      if (prints > 1 && up > 0) { unit += up; applied.push({ name: g.name, cents: up }) }
    } else if (up > 0) {
      unit += up; applied.push({ name: g.name, cents: up })
    }
  }
  return { unitCents: unit, applied }
}

// ---------- Cart (localStorage) ----------
const CART_KEY = 'ffstore_cart_v2'

export function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || []
  } catch {
    return []
  }
}

export function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  } catch {
    /* ignore */
  }
}

export const cartCount = (cart) => cart.reduce((n, i) => n + i.qty, 0)
export const cartTotalCents = (cart) => cart.reduce((n, i) => n + i.unit_price_cents * i.qty, 0)

// ---------- Admin API ----------
// All admin actions post to /api/admin with { passcode, action, ... }.
// The passcode lives only in sessionStorage on the admin's device.
const PASS_KEY = 'ffstore_admin_pass'

export const getPass = () => sessionStorage.getItem(PASS_KEY) || ''
export const setPass = (p) => sessionStorage.setItem(PASS_KEY, p)
export const clearPass = () => sessionStorage.removeItem(PASS_KEY)

export async function adminApi(action, payload = {}) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: getPass(), action, ...payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export async function placeOrder(order) {
  const res = await fetch('/api/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Could not place order (${res.status})`)
  return data
}

// Build a Venmo deep link that prefills amount + note.
export function venmoLink(handle, amountCents, note) {
  if (!handle) return ''
  const amount = (amountCents / 100).toFixed(2)
  const params = new URLSearchParams({
    txn: 'pay',
    recipients: handle.replace(/^@/, ''),
    amount,
    note,
  })
  return `https://venmo.com/?${params.toString()}`
}
