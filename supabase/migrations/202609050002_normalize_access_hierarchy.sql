-- Canonical Porta Tap hierarchy
-- King Admin -> Client (customer organization) -> Site -> Unit -> Service Request
--
-- This migration is written for the audited database state:
-- one client, zero sites, two units, six service requests, and empty legacy
-- customers / roles / users tables. It creates one Initial Site and assigns
-- the existing units to it so no tickets are lost.

create extension if not exists pgcrypto;

-- Replace the unused integer customer hierarchy with UUID-based client sites.
alter table public.users drop constraint if exists users_site_id_fkey;
alter table public.sites drop constraint if exists sites_customer_id_fkey;
alter table public.sites alter column site_id drop default;
alter table public.sites rename column site_id to id;
alter table public.sites alter column id type uuid using gen_random_uuid();
alter table public.sites alter column id set default gen_random_uuid();
alter table public.sites drop column customer_id;
alter table public.sites add column client_id uuid references public.clients(id);

insert into public.sites (site_name, address, client_id)
select 'Initial Site', null, id
from public.clients
where not exists (select 1 from public.sites)
order by created_at nulls last
limit 1;

-- Existing units have no valid site relationship because sites previously used
-- integer IDs. Assign the two existing units to the Initial Site.
update public.units
set site_id = (select id from public.sites order by id limit 1);

alter table public.sites alter column client_id set not null;
alter table public.units alter column site_id set not null;
alter table public.units drop constraint if exists units_site_id_fkey;
alter table public.units
  add constraint units_site_id_fkey
  foreign key (site_id) references public.sites(id) on delete restrict;

-- These tables are empty and belong to the replaced integer-ID hierarchy.
drop table if exists public.users;
drop table if exists public.roles;
drop table if exists public.customers;

-- A completion photo must never overwrite the original reporter photo.
alter table public.service_requests
  add column if not exists proof_photo_url text;
alter table public.service_requests
  add column if not exists reporter_token uuid not null default gen_random_uuid();

-- Auth-backed roles and technician site assignments.
create table if not exists public.king_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.cleaner_site_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, site_id)
);

create unique index if not exists client_users_one_client_per_user
  on public.client_users (user_id);
alter table public.cleaner_users
  add column if not exists client_id uuid references public.clients(id);

create or replace function public.is_king_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.king_admins where user_id = auth.uid());
$$;

create or replace function public.current_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from public.client_users where user_id = auth.uid() limit 1;
$$;

create or replace function public.is_assigned_cleaner_for_unit(target_unit_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.cleaner_site_assignments assignments
    join public.units on units.site_id = assignments.site_id
    where assignments.user_id = auth.uid()
      and units.id = target_unit_id
  );
$$;

create or replace function public.is_active_unit(target_unit_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.units
    where id = target_unit_id and coalesce(status, 'active') = 'active'
  );
$$;

create or replace function public.request_reporter_token()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return (current_setting('request.headers', true)::jsonb ->> 'x-reporter-token')::uuid;
exception when others then
  return null;
end;
$$;

alter table public.clients enable row level security;
alter table public.client_users enable row level security;
alter table public.cleaner_users enable row level security;
alter table public.king_admins enable row level security;
alter table public.cleaner_site_assignments enable row level security;
alter table public.sites enable row level security;
alter table public.units enable row level security;
alter table public.service_requests enable row level security;

create policy "King Admins manage clients" on public.clients for all
  using (public.is_king_admin()) with check (public.is_king_admin());
create policy "Customer Admins view their client" on public.clients for select
  using (id = public.current_client_id());

create policy "Users view their customer role" on public.client_users for select
  using (user_id = auth.uid() or public.is_king_admin());
create policy "King Admins manage customer roles" on public.client_users for all
  using (public.is_king_admin()) with check (public.is_king_admin());

create policy "Users view their cleaner role" on public.cleaner_users for select
  using (user_id = auth.uid() or public.is_king_admin());
create policy "Customer Admins view their cleaners" on public.cleaner_users for select
  using (client_id = public.current_client_id());
create policy "King Admins manage cleaner roles" on public.cleaner_users for all
  using (public.is_king_admin()) with check (public.is_king_admin());

create policy "Users view their own King role" on public.king_admins for select
  using (user_id = auth.uid());
create policy "King Admins manage King roles" on public.king_admins for all
  using (public.is_king_admin()) with check (public.is_king_admin());

create policy "Technicians view their assignments" on public.cleaner_site_assignments for select
  using (user_id = auth.uid());
create policy "Customer Admins view cleaner assignments" on public.cleaner_site_assignments for select
  using (
    exists (
      select 1 from public.sites
      where sites.id = cleaner_site_assignments.site_id
        and sites.client_id = public.current_client_id()
    )
  );
create policy "King Admins manage technician assignments" on public.cleaner_site_assignments for all
  using (public.is_king_admin()) with check (public.is_king_admin());

create policy "Authorized admins manage sites" on public.sites for all
  using (public.is_king_admin() or client_id = public.current_client_id())
  with check (public.is_king_admin() or client_id = public.current_client_id());

create policy "Authorized staff view units" on public.units for select
  using (
    public.is_king_admin()
    or exists (select 1 from public.sites where sites.id = units.site_id and sites.client_id = public.current_client_id())
    or exists (select 1 from public.cleaner_site_assignments where cleaner_site_assignments.site_id = units.site_id and cleaner_site_assignments.user_id = auth.uid())
  );
create policy "Authorized admins manage units" on public.units for all
  using (
    public.is_king_admin()
    or exists (select 1 from public.sites where sites.id = units.site_id and sites.client_id = public.current_client_id())
  )
  with check (
    public.is_king_admin()
    or exists (select 1 from public.sites where sites.id = units.site_id and sites.client_id = public.current_client_id())
  );

drop policy if exists "Allow public insert to service_requests" on public.service_requests;
drop policy if exists "Allow public select on service_requests" on public.service_requests;
drop policy if exists "Allow public update to service_requests" on public.service_requests;
create policy "Public users create requests for active units" on public.service_requests for insert
  with check (
    public.is_active_unit(unit_id)
    and reporter_token = public.request_reporter_token()
  );
create policy "Reporters view their own new request" on public.service_requests for select
  using (reporter_token = public.request_reporter_token());
create policy "Reporters attach photos to their own request" on public.service_requests for update
  using (reporter_token = public.request_reporter_token())
  with check (reporter_token = public.request_reporter_token());
create policy "Authorized staff view service requests" on public.service_requests for select
  using (
    public.is_king_admin()
    or public.is_assigned_cleaner_for_unit(unit_id)
    or exists (
      select 1 from public.units join public.sites on sites.id = units.site_id
      where units.id = service_requests.unit_id and sites.client_id = public.current_client_id()
    )
  );
create policy "Authorized staff update service requests" on public.service_requests for update
  using (
    public.is_king_admin()
    or public.is_assigned_cleaner_for_unit(unit_id)
    or exists (
      select 1 from public.units join public.sites on sites.id = units.site_id
      where units.id = service_requests.unit_id and sites.client_id = public.current_client_id()
    )
  )
  with check (
    public.is_king_admin()
    or public.is_assigned_cleaner_for_unit(unit_id)
    or exists (
      select 1 from public.units join public.sites on sites.id = units.site_id
      where units.id = service_requests.unit_id and sites.client_id = public.current_client_id()
    )
  );

-- Reporter images may be uploaded anonymously; completion proof requires login.
drop policy if exists "Allow public uploads" on storage.objects;
create policy "Public users upload report images" on storage.objects for insert to public
  with check (bucket_id = 'service-photos' and name like 'user_reports/%');
create policy "Authenticated users upload completion proof" on storage.objects for insert to authenticated
  with check (bucket_id = 'service-photos' and name like 'proof/%');

-- Run this separately after the migration, replacing the UUID with your own
-- Supabase Auth user ID:
-- insert into public.king_admins (user_id) values ('YOUR_AUTH_USER_UUID');
