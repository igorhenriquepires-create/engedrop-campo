-- ENGEDROP CAMPO — schema, private storage and Row Level Security
-- Apply with: supabase db push  (or paste in the Supabase SQL editor)

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Security-definer avoids an RLS recursion while keeping all application tables private.
create or replace function public.is_authorized_staff(check_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = check_user and active = true
  );
$$;

revoke all on function public.is_authorized_staff(uuid) from public;
grant execute on function public.is_authorized_staff(uuid) to authenticated;

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_user();

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  document text,
  phone text,
  email text,
  notes text,
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  city text,
  state text check (state is null or char_length(state) <= 2),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  area_ha numeric(12,2) check (area_ha is null or area_ha >= 0),
  row_spacing_m numeric(7,4) check (row_spacing_m is null or row_spacing_m > 0),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  visit_date date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  season text,
  technical_manager text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  field_id uuid not null references public.fields(id) on delete restrict,
  culture text not null check (char_length(trim(culture)) > 0),
  phenological_stage text,
  phenological_custom text,
  node_count numeric(10,2) check (node_count is null or node_count >= 0),
  nodule_count numeric(10,2) check (nodule_count is null or nodule_count >= 0),
  observations text,
  row_spacing_m numeric(7,4) check (row_spacing_m is null or row_spacing_m > 0),
  stand_measurements jsonb not null default '[]'::jsonb,
  stand_plants_per_meter numeric(14,4) check (stand_plants_per_meter is null or stand_plants_per_meter >= 0),
  stand_plants_per_hectare numeric(16,2) check (stand_plants_per_hectare is null or stand_plants_per_hectare >= 0),
  stand_source text not null default 'calculated' check (stand_source in ('calculated', 'manual', 'none')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluations_field_matches_property check (field_id is not null)
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  filename text not null,
  mime_type text not null check (mime_type like 'image/%'),
  caption text,
  position integer not null default 0 check (position >= 0),
  storage_path text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  evaluation_ids uuid[] not null default '{}',
  filename text not null,
  storage_path text,
  generated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_name_idx on public.clients using btree (name);
create index if not exists properties_client_id_idx on public.properties (client_id);
create index if not exists fields_property_id_idx on public.fields (property_id);
create index if not exists visits_client_date_idx on public.visits (client_id, visit_date desc);
create index if not exists visits_date_idx on public.visits (visit_date desc);
create index if not exists evaluations_visit_id_idx on public.evaluations (visit_id);
create index if not exists evaluations_field_id_idx on public.evaluations (field_id);
create index if not exists evaluations_culture_idx on public.evaluations (culture);
create index if not exists photos_evaluation_position_idx on public.photos (evaluation_id, position);
create index if not exists reports_visit_id_idx on public.reports (visit_id);

do $$
declare target text;
begin
  foreach target in array array['profiles','clients','properties','fields','visits','evaluations','photos','reports'] loop
    execute format('drop trigger if exists %I on public.%I', 'set_' || target || '_updated_at', target);
    execute format('create trigger %I before update on public.%I for each row execute procedure public.set_updated_at()', 'set_' || target || '_updated_at', target);
    execute format('alter table public.%I enable row level security', target);
  end loop;
end;
$$;

-- Existing policies are deliberately replaced so a migration rerun does not leave broader access behind.
do $$
declare target text;
begin
  foreach target in array array['clients','properties','fields','visits','evaluations','photos','reports'] loop
    execute format('drop policy if exists staff_all_%I on public.%I', target, target);
    execute format('create policy staff_all_%I on public.%I for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff())', target, target);
  end loop;
end;
$$;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());

-- Buckets are private: files are obtained through authenticated storage requests only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('visit-photos', 'visit-photos', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic']),
  ('visit-reports', 'visit-reports', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false;

drop policy if exists engedrop_staff_photos on storage.objects;
create policy engedrop_staff_photos on storage.objects for all to authenticated
  using (bucket_id = 'visit-photos' and public.is_authorized_staff())
  with check (bucket_id = 'visit-photos' and public.is_authorized_staff());
drop policy if exists engedrop_staff_reports on storage.objects;
create policy engedrop_staff_reports on storage.objects for all to authenticated
  using (bucket_id = 'visit-reports' and public.is_authorized_staff())
  with check (bucket_id = 'visit-reports' and public.is_authorized_staff());

-- After creating Engedrop users in Supabase Auth, an administrator must explicitly activate each staff account:
-- update public.profiles set active = true where email = 'tecnico@engedrop.com.br';
