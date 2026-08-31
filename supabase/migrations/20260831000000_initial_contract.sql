begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create type public.user_role as enum (
  'fleet_manager',
  'dispatcher',
  'safety_officer',
  'financial_analyst'
);

create type public.vehicle_status as enum (
  'available',
  'on_trip',
  'in_shop',
  'retired'
);

create type public.driver_status as enum (
  'available',
  'on_trip',
  'off_duty',
  'suspended'
);

create type public.trip_status as enum (
  'draft',
  'dispatched',
  'completed',
  'cancelled'
);

create type public.maintenance_status as enum (
  'active',
  'closed'
);

create type public.expense_category as enum (
  'maintenance',
  'toll',
  'other'
);

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (pg_catalog.char_length(pg_catalog.btrim(display_name)) > 0),
  role public.user_role not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null,
  registration_number_normalized text generated always as (
    pg_catalog.upper(pg_catalog.btrim(registration_number))
  ) stored,
  name_model text not null check (pg_catalog.char_length(pg_catalog.btrim(name_model)) > 0),
  type text not null check (pg_catalog.char_length(pg_catalog.btrim(type)) > 0),
  max_load_kg numeric(12, 2) not null check (max_load_kg > 0),
  odometer_km numeric(14, 2) not null default 0 check (odometer_km >= 0),
  acquisition_cost numeric(14, 2) not null default 0 check (acquisition_cost >= 0),
  region text not null check (pg_catalog.char_length(pg_catalog.btrim(region)) > 0),
  status public.vehicle_status not null default 'available',
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint vehicles_registration_number_not_blank
    check (pg_catalog.char_length(registration_number_normalized) > 0),
  constraint vehicles_registration_number_normalized_key
    unique (registration_number_normalized)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) > 0),
  license_number text not null,
  license_number_normalized text generated always as (
    pg_catalog.upper(pg_catalog.btrim(license_number))
  ) stored,
  license_category text not null check (pg_catalog.char_length(pg_catalog.btrim(license_category)) > 0),
  license_expiry_date date not null,
  contact_number text not null check (pg_catalog.char_length(pg_catalog.btrim(contact_number)) > 0),
  safety_score numeric(5, 2) not null default 100 check (safety_score between 0 and 100),
  status public.driver_status not null default 'available',
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint drivers_license_number_not_blank
    check (pg_catalog.char_length(license_number_normalized) > 0),
  constraint drivers_license_number_normalized_key
    unique (license_number_normalized)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  source text not null check (pg_catalog.char_length(pg_catalog.btrim(source)) > 0),
  destination text not null check (pg_catalog.char_length(pg_catalog.btrim(destination)) > 0),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  driver_id uuid not null references public.drivers (id) on delete restrict,
  cargo_weight_kg numeric(12, 2) not null check (cargo_weight_kg > 0),
  planned_distance_km numeric(12, 2) not null check (planned_distance_km > 0),
  start_odometer_km numeric(14, 2) check (start_odometer_km >= 0),
  final_odometer_km numeric(14, 2) check (final_odometer_km >= 0),
  actual_distance_km numeric(14, 2) check (actual_distance_km >= 0),
  revenue numeric(14, 2) not null default 0 check (revenue >= 0),
  status public.trip_status not null default 'draft',
  dispatched_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint trips_final_odometer_not_decreased check (
    final_odometer_km is null
    or start_odometer_km is null
    or final_odometer_km >= start_odometer_km
  ),
  constraint trips_completed_measurements_present check (
    status <> 'completed'
    or (
      start_odometer_km is not null
      and final_odometer_km is not null
      and actual_distance_km is not null
    )
  )
);

create table public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  maintenance_type text not null check (pg_catalog.char_length(pg_catalog.btrim(maintenance_type)) > 0),
  description text,
  status public.maintenance_status not null default 'active',
  opened_at timestamptz not null default pg_catalog.now(),
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint maintenance_logs_closed_timestamp check (
    (status = 'active' and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  )
);

create table public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  trip_id uuid references public.trips (id) on delete restrict,
  liters numeric(12, 3) not null check (liters > 0),
  cost numeric(14, 2) not null check (cost >= 0),
  logged_date date not null default current_date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  trip_id uuid references public.trips (id) on delete restrict,
  maintenance_log_id uuid unique references public.maintenance_logs (id) on delete restrict,
  category public.expense_category not null,
  amount numeric(14, 2) not null check (amount >= 0),
  expense_date date not null default current_date,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint expenses_maintenance_link_category check (
    maintenance_log_id is null or category = 'maintenance'
  )
);

create unique index trips_one_dispatched_vehicle_idx
  on public.trips (vehicle_id)
  where status = 'dispatched';

create unique index trips_one_dispatched_driver_idx
  on public.trips (driver_id)
  where status = 'dispatched';

create unique index maintenance_logs_one_active_vehicle_idx
  on public.maintenance_logs (vehicle_id)
  where status = 'active';

create index vehicles_status_region_idx
  on public.vehicles (status, region)
  where archived_at is null;

create index drivers_status_expiry_idx
  on public.drivers (status, license_expiry_date)
  where archived_at is null;

create index trips_status_created_at_idx
  on public.trips (status, created_at desc);

create index fuel_logs_vehicle_date_idx
  on public.fuel_logs (vehicle_id, logged_date desc);

create index expenses_vehicle_date_idx
  on public.expenses (vehicle_id, expense_date desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function private.set_updated_at();

create trigger drivers_set_updated_at
before update on public.drivers
for each row execute function private.set_updated_at();

create trigger trips_set_updated_at
before update on public.trips
for each row execute function private.set_updated_at();

create trigger maintenance_logs_set_updated_at
before update on public.maintenance_logs
for each row execute function private.set_updated_at();

create trigger fuel_logs_set_updated_at
before update on public.fuel_logs
for each row execute function private.set_updated_at();

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.trips enable row level security;
alter table public.maintenance_logs enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.expenses enable row level security;

-- P0 is intentionally deny-by-default. P1-C1 grants table privileges and adds
-- explicit role policies after the role matrix is approved.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.vehicles from anon, authenticated;
revoke all on table public.drivers from anon, authenticated;
revoke all on table public.trips from anon, authenticated;
revoke all on table public.maintenance_logs from anon, authenticated;
revoke all on table public.fuel_logs from anon, authenticated;
revoke all on table public.expenses from anon, authenticated;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

comment on schema private is
  'Non-exposed helpers. Security-definer functions must use an empty search_path and schema-qualified names.';

comment on table public.vehicles is
  'Fleet registry. Operational status changes must use named lifecycle commands, not generic updates.';

comment on table public.drivers is
  'Driver registry and compliance state. Archived drivers are never dispatch-eligible.';

comment on table public.trips is
  'Trip lifecycle. Dispatch, completion, and cancellation are implemented as atomic RPC commands in P2-C1.';

comment on table public.maintenance_logs is
  'Vehicle maintenance lifecycle. Open and close transitions are implemented as atomic RPC commands in P2-C1.';

comment on table public.expenses is
  'Canonical expense ledger. A maintenance log may link to at most one maintenance-category expense.';

commit;
