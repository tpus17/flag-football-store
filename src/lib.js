/* Small shared helpers: money formatting, cart storage, admin API calls. */

export const money = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const dollarsToCents = (v) => Math.round(Number(v || 0) * 100)

// ---------- Cart (localStorage) ----------
const CART_KEY = 'ffstore_cart_v1'

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
