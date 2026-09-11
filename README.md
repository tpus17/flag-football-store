# 🏈 Flag Football Team Store

A self-hosted fundraising store for your team. Buyers browse gear, pick sizes,
and place an order; they pay you by **Venmo, Zelle, or cash** and pick up their
items. You manage everything from a passcode-protected **Admin** page: orders,
inventory, and store settings.

**Stack:** Vite + React + Supabase, deployed on Vercel (same as your other apps).

---

## How it works

- **Storefront** (`/`) — product grid → cart → checkout. No card processing;
  the buyer chooses how they'll pay and gets your payment instructions on the
  confirmation screen (including a one-tap Venmo link).
- **Admin** (`/#/admin`) — passcode login. Tabs:
  - **Orders** — see every order + contact info, mark **Paid** and **Handed out**,
    filter, and watch your fundraising total.
  - **Products** — add/edit items, set prices, manage sizes and **stock counts**
    (stock decrements automatically as orders come in).
  - **Settings** — team name, tagline, Venmo/Zelle/cash instructions, pickup
    info, accent color, and a fundraising goal bar.

**Security:** the public site can only *read* active products. All customer data
and every write goes through serverless `/api` functions using the Supabase
service-role key, gated by your admin passcode. Customer names/contacts are never
exposed to the public site.

---

## Setup

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Once it's ready, open **SQL Editor → New query**, paste the contents of
   [`schema.sql`](schema.sql), and **Run**. This creates the tables, security
   policies, and 3 sample products.
3. In **Project Settings → API**, copy:
   - **Project URL**
   - **anon public** key
   - **service_role** key (keep this secret!)

### 2. Configure environment variables
Copy `.env.example` to `.env` and fill in the values:

```
VITE_SUPABASE_URL=...        # Project URL
VITE_SUPABASE_KEY=...        # anon public key
SUPABASE_URL=...             # Project URL (again, for the API functions)
SUPABASE_SERVICE_ROLE_KEY=...# service_role key — SECRET
ADMIN_PASSCODE=...           # pick a passcode for the Admin page
```

### 3. Run locally
```
npm install
npm run dev
```
Open the printed URL. The store is at `/`, the admin at `/#/admin`.

> Note: the `/api` functions run on Vercel. To exercise checkout + admin locally,
> use `vercel dev` (`npm i -g vercel`) instead of `npm run dev`, or just deploy.

---

## Deploy to Vercel
1. Push this folder to a Git repo (or run `vercel` from the CLI).
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. In **Settings → Environment Variables**, add **all five** variables above
   (the two `VITE_` ones *and* `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ADMIN_PASSCODE`).
4. Deploy. Share the URL with your team; keep `/#/admin` for yourself.

---

## Running the fundraiser
1. Log in to `/#/admin` → **Settings**: set your team name, **Venmo handle**,
   Zelle info, pickup details, colors, and a goal.
2. **Products**: edit the sample items or add your own, set prices and how many
   of each size you have on hand.
3. Share the store link. As orders arrive, buyers pay you; you mark each order
   **Paid**, then **Handed out** when you deliver the gear.

### Adding product photos
Paste an image URL into a product's **Image URL** field. To host images on
Supabase: **Storage → New bucket** (make it public) → upload → copy the public
URL.
