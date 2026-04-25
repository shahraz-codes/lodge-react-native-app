-- Lodge Booking Management System — Supabase Database Schema
-- Run this in your Supabase SQL Editor to set up all tables and policies.
-- For existing databases, see the MIGRATION section at the bottom.

-- 1. Profiles table (linked to Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  role text check (role in ('receptionist', 'owner'))
);

alter table public.profiles enable row level security;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid());

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'receptionist')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Rooms table
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  type text not null default 'single' check (type in ('single', 'double', 'suite', 'deluxe')),
  price numeric(10,2) not null default 0,
  half_day_price numeric(10,2),
  hourly_price numeric(10,2),
  status text not null default 'available' check (status in ('available', 'occupied', 'cleaning')),
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
create policy "Rooms are viewable by authenticated users"
  on public.rooms for select to authenticated using (true);
create policy "Owners can manage rooms"
  on public.rooms for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
  );
create policy "Receptionists can update room status"
  on public.rooms for update to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'receptionist')
  );

-- 3. Customers table
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  id_proof text not null,
  id_proof_document_url text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;
create policy "Customers are viewable by authenticated users"
  on public.customers for select to authenticated using (true);
create policy "Receptionists can insert customers"
  on public.customers for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'receptionist')
  );

-- 4. Bookings table
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  room_id uuid not null references public.rooms(id),
  check_in timestamptz not null,
  check_out timestamptz not null,
  booking_type text not null default 'full_day' check (booking_type in ('full_day', 'half_day', 'hourly')),
  hours numeric,
  status text not null default 'booked' check (status in ('booked', 'checked_in', 'checked_out', 'cancelled')),
  total_amount numeric not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'partial', 'paid')),
  payment_method text check (payment_method in ('cash', 'upi', 'card') or payment_method is null),
  amount_paid numeric not null default 0,
  cancellation_reason text,
  created_at timestamptz not null default now()
);

alter table public.bookings enable row level security;
create policy "Bookings are viewable by authenticated users"
  on public.bookings for select to authenticated using (true);
create policy "Receptionists can manage bookings"
  on public.bookings for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'receptionist')
  );

-- 5. Enable Realtime for rooms and bookings
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.bookings;

-- 6. Storage bucket for ID proof documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'id-proofs',
  'id-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "Authenticated users can upload id proofs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'id-proofs');

create policy "Authenticated users can read id proofs"
  on storage.objects for select to authenticated
  using (bucket_id = 'id-proofs');

-- 7. Sample seed data (optional — remove in production)
insert into public.rooms (room_number, type, price, half_day_price, hourly_price, status) values
  ('101', 'single',  1500,  900, 100, 'available'),
  ('102', 'single',  1500,  900, 100, 'available'),
  ('103', 'double',  2500, 1500, 150, 'available'),
  ('104', 'double',  2500, 1500, 150, 'available'),
  ('201', 'suite',   4000, 2400, 250, 'available'),
  ('202', 'suite',   4000, 2400, 250, 'available'),
  ('301', 'deluxe',  6000, 3600, 350, 'available'),
  ('302', 'deluxe',  6000, 3600, 350, 'available')
on conflict (room_number) do nothing;


-- ============================================================================
-- MIGRATION: for existing databases (run ONCE in Supabase SQL Editor)
-- ============================================================================
-- Uncomment and run if you already have the original schema deployed.
--
-- -- 1. Convert check_in/check_out from date to timestamptz
-- ALTER TABLE public.bookings
--   ALTER COLUMN check_in TYPE timestamptz USING check_in::timestamptz,
--   ALTER COLUMN check_out TYPE timestamptz USING check_out::timestamptz;
--
-- -- 2. Add booking_type column
-- ALTER TABLE public.bookings
--   ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'full_day'
--   CHECK (booking_type IN ('full_day', 'half_day', 'hourly'));
--
-- -- 3. Add hours column for hourly bookings (nullable)
-- ALTER TABLE public.bookings
--   ADD COLUMN IF NOT EXISTS hours numeric;
--
-- -- 4. Add payment columns
-- ALTER TABLE public.bookings
--   ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
--   CHECK (payment_status IN ('pending', 'partial', 'paid'));
-- ALTER TABLE public.bookings
--   ADD COLUMN IF NOT EXISTS payment_method text
--   CHECK (payment_method IN ('cash', 'upi', 'card') OR payment_method IS NULL);
-- ALTER TABLE public.bookings
--   ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;
--
-- -- 5. Expand status constraint and add cancellation reason
-- ALTER TABLE public.bookings
--   DROP CONSTRAINT IF EXISTS bookings_status_check;
-- ALTER TABLE public.bookings
--   ADD CONSTRAINT bookings_status_check
--   CHECK (status IN ('booked', 'checked_in', 'checked_out', 'cancelled'));
-- ALTER TABLE public.bookings
--   ADD COLUMN IF NOT EXISTS cancellation_reason text;
--
-- -- 6. Add pricing columns to rooms
-- ALTER TABLE public.rooms
--   ADD COLUMN IF NOT EXISTS half_day_price numeric(10,2),
--   ADD COLUMN IF NOT EXISTS hourly_price numeric(10,2);
--
-- -- 7. Backfill existing bookings
-- UPDATE public.bookings
--   SET booking_type = 'full_day',
--       payment_status = 'paid',
--       amount_paid = total_amount
--   WHERE booking_type IS NULL OR payment_status IS NULL;
