-- ============================================================
--  Flag Football Team Store — Supabase schema
--  Run this once in the Supabase SQL editor (SQL → New query).
-- ============================================================

-- ---------- Store settings (single row, id = 1) ----------
create table if not exists public.store_settings (
  id            int primary key default 1,
  team_name     text    not null default 'C-Side Flag Football',
  tagline       text    not null default 'Every purchase supports the team!',
  venmo_handle  text    default '',          -- e.g. "CoachSmith" (no @)
  zelle_info    text    default '',          -- e.g. "coach@email.com or 555-123-4567"
  cash_info     text    default 'Pay in cash at pickup.',
  pickup_info   text    default 'Pickup details will be arranged after your order.',
  accent_color  text    not null default '#7a1d2b',   -- C-Side garnet
  fundraiser_goal_cents int not null default 0,
  updated_at    timestamptz not null default now(),
  constraint only_one_row check (id = 1)
);

insert into public.store_settings (id) values (1)
  on conflict (id) do nothing;

-- ---------- Products ----------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text    not null,
  description text    default '',
  price_cents int     not null check (price_cents >= 0),
  image_url   text    default '',                 -- cover image (mirrors images[0])
  images      jsonb   not null default '[]'::jsonb, -- ordered list of image URLs (carousel)
  options     jsonb   not null default '[]'::jsonb, -- [{name, choices:[...]}] e.g. Size / Color / Logo
  preview     jsonb   not null default '{}'::jsonb, -- {colorImages, logoImages, placements} for live overlay
  active      boolean not null default true,
  sort_order  int     not null default 0,
  created_at  timestamptz not null default now()
);
-- Migrations for an existing project: add columns if they aren't there yet.
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists options jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists preview jsonb not null default '{}'::jsonb;

-- ---------- Product variants (sizes / options) ----------
-- Every product has at least one variant. Use "One Size" when there are no sizes.
create table if not exists public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  size_label  text not null default 'One Size',
  stock       int  not null default 0 check (stock >= 0),
  sort_order  int  not null default 0
);
create index if not exists idx_variants_product on public.product_variants(product_id);

-- ---------- Orders ----------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  buyer_name     text not null,
  buyer_contact  text not null,               -- phone or email
  contact_type   text not null default 'phone',
  payment_method text not null,               -- 'venmo' | 'zelle' | 'cash'
  pickup_note    text default '',
  note           text default '',             -- buyer's optional note
  total_cents    int  not null default 0,
  paid           boolean not null default false,
  fulfilled      boolean not null default false
);
create index if not exists idx_orders_created on public.orders(created_at desc);

-- ---------- Order line items ----------
create table if not exists public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  variant_id      uuid references public.product_variants(id) on delete set null,
  product_name    text not null,              -- snapshot at purchase time
  size_label      text not null default '',   -- human-readable option summary (e.g. "M · Maroon · Women's")
  options         jsonb not null default '{}'::jsonb, -- selected options {name: value}
  unit_price_cents int not null,
  qty             int not null check (qty > 0)
);
create index if not exists idx_items_order on public.order_items(order_id);
-- Migration for an existing project: add the selected-options column if missing.
alter table public.order_items add column if not exists options jsonb not null default '{}'::jsonb;

-- ============================================================
--  Row Level Security
--  Public (anon key) may ONLY read active products/variants and
--  the store settings. Everything else — reading orders, all
--  writes — happens through /api functions using the service
--  role key, which bypasses RLS. Customer data is never exposed.
-- ============================================================
alter table public.store_settings   enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;

-- Public read: store settings
drop policy if exists "public read settings" on public.store_settings;
create policy "public read settings" on public.store_settings
  for select using (true);

-- Public read: active products only
drop policy if exists "public read active products" on public.products;
create policy "public read active products" on public.products
  for select using (active = true);

-- Public read: variants (of any product; the store only queries active ones)
drop policy if exists "public read variants" on public.product_variants;
create policy "public read variants" on public.product_variants
  for select using (true);

-- No anon policies on orders / order_items => anon cannot read or write them.
-- (The service role used by /api bypasses RLS entirely.)

-- ============================================================
--  Atomic stock decrement helper (used when placing an order).
--  Returns true if stock was available and decremented.
-- ============================================================
create or replace function public.decrement_stock(p_variant_id uuid, p_qty int)
returns boolean
language plpgsql
as $$
declare
  ok boolean;
begin
  update public.product_variants
     set stock = stock - p_qty
   where id = p_variant_id
     and stock >= p_qty
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

-- ============================================================
--  Sample data — edit or delete freely in the Admin panel.
-- ============================================================
do $$
declare
  v_tee uuid;
  v_hoodie uuid;
  v_hat uuid;
begin
  if not exists (select 1 from public.products) then
    insert into public.products (name, description, price_cents, sort_order)
      values ('Team T-Shirt', 'Soft cotton tee with the team logo.', 2000, 1)
      returning id into v_tee;
    insert into public.product_variants (product_id, size_label, stock, sort_order) values
      (v_tee, 'YS', 6, 1), (v_tee, 'YM', 6, 2), (v_tee, 'YL', 6, 3),
      (v_tee, 'S', 8, 4), (v_tee, 'M', 10, 5), (v_tee, 'L', 10, 6), (v_tee, 'XL', 6, 7);

    insert into public.products (name, description, price_cents, sort_order)
      values ('Team Hoodie', 'Cozy fleece hoodie — great for cold game days.', 4000, 2)
      returning id into v_hoodie;
    insert into public.product_variants (product_id, size_label, stock, sort_order) values
      (v_hoodie, 'YM', 4, 1), (v_hoodie, 'YL', 4, 2),
      (v_hoodie, 'S', 5, 3), (v_hoodie, 'M', 6, 4), (v_hoodie, 'L', 6, 5), (v_hoodie, 'XL', 4, 6);

    insert into public.products (name, description, price_cents, sort_order)
      values ('Team Cap', 'Adjustable cap — one size fits most.', 1800, 3)
      returning id into v_hat;
    insert into public.product_variants (product_id, size_label, stock, sort_order) values
      (v_hat, 'One Size', 20, 1);
  end if;
end $$;
