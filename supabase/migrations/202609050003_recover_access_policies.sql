-- Recovery migration for a partially applied 202609050002 migration.
-- Run this ONCE against the current database state reported on 2026-09-05.

alter table public.cleaner_users
  add column if not exists client_id uuid references public.clients(id);

create unique index if not exists client_users_one_client_per_user
  on public.client_users (user_id);

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
    select 1 from public.cleaner_site_assignments assignments
    join public.units on units.site_id = assignments.site_id
    where assignments.user_id = auth.uid() and units.id = target_unit_id
  );
$$;

create or replace function public.is_active_unit(target_unit_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.units where id = target_unit_id and coalesce(status, 'active') = 'active');
$$;

create or replace function public.request_reporter_token()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return (current_setting('request.headers', true)::jsonb ->> 'x-reporter-token')::uuid;
exception when others then return null;
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

drop policy if exists "King Admins manage clients" on public.clients;
drop policy if exists "Customer Admins view their client" on public.clients;
drop policy if exists "Users view their customer role" on public.client_users;
drop policy if exists "King Admins manage customer roles" on public.client_users;
drop policy if exists "Users view their cleaner role" on public.cleaner_users;
drop policy if exists "Customer Admins view their cleaners" on public.cleaner_users;
drop policy if exists "King Admins manage cleaner roles" on public.cleaner_users;
drop policy if exists "Users view their own King role" on public.king_admins;
drop policy if exists "King Admins manage King roles" on public.king_admins;
drop policy if exists "Technicians view their assignments" on public.cleaner_site_assignments;
drop policy if exists "Customer Admins view cleaner assignments" on public.cleaner_site_assignments;
drop policy if exists "King Admins manage technician assignments" on public.cleaner_site_assignments;
drop policy if exists "Authorized admins manage sites" on public.sites;
drop policy if exists "Authorized staff view units" on public.units;
drop policy if exists "Authorized admins manage units" on public.units;
drop policy if exists "Reporters view their own new request" on public.service_requests;
drop policy if exists "Reporters attach photos to their own request" on public.service_requests;
drop policy if exists "Authorized staff view service requests" on public.service_requests;
drop policy if exists "Authorized staff update service requests" on public.service_requests;
drop policy if exists "Public users create requests for active units" on public.service_requests;
drop policy if exists "Public users upload report images" on storage.objects;
drop policy if exists "Authenticated users upload completion proof" on storage.objects;

create policy "King Admins manage clients" on public.clients for all using (public.is_king_admin()) with check (public.is_king_admin());
create policy "Customer Admins view their client" on public.clients for select using (id = public.current_client_id());
create policy "Users view their customer role" on public.client_users for select using (user_id = auth.uid() or public.is_king_admin());
create policy "King Admins manage customer roles" on public.client_users for all using (public.is_king_admin()) with check (public.is_king_admin());
create policy "Users view their cleaner role" on public.cleaner_users for select using (user_id = auth.uid() or public.is_king_admin());
create policy "Customer Admins view their cleaners" on public.cleaner_users for select using (client_id = public.current_client_id());
create policy "King Admins manage cleaner roles" on public.cleaner_users for all using (public.is_king_admin()) with check (public.is_king_admin());
create policy "Users view their own King role" on public.king_admins for select using (user_id = auth.uid());
create policy "King Admins manage King roles" on public.king_admins for all using (public.is_king_admin()) with check (public.is_king_admin());
create policy "Technicians view their assignments" on public.cleaner_site_assignments for select using (user_id = auth.uid());
create policy "Customer Admins view cleaner assignments" on public.cleaner_site_assignments for select using (exists (select 1 from public.sites where sites.id = cleaner_site_assignments.site_id and sites.client_id = public.current_client_id()));
create policy "King Admins manage technician assignments" on public.cleaner_site_assignments for all using (public.is_king_admin()) with check (public.is_king_admin());
create policy "Authorized admins manage sites" on public.sites for all using (public.is_king_admin() or client_id = public.current_client_id()) with check (public.is_king_admin() or client_id = public.current_client_id());
create policy "Authorized staff view units" on public.units for select using (public.is_king_admin() or exists (select 1 from public.sites where sites.id = units.site_id and sites.client_id = public.current_client_id()) or exists (select 1 from public.cleaner_site_assignments where cleaner_site_assignments.site_id = units.site_id and cleaner_site_assignments.user_id = auth.uid()));
create policy "Authorized admins manage units" on public.units for all using (public.is_king_admin() or exists (select 1 from public.sites where sites.id = units.site_id and sites.client_id = public.current_client_id())) with check (public.is_king_admin() or exists (select 1 from public.sites where sites.id = units.site_id and sites.client_id = public.current_client_id()));

drop policy if exists "Allow public insert to service_requests" on public.service_requests;
drop policy if exists "Allow public select on service_requests" on public.service_requests;
drop policy if exists "Allow public update to service_requests" on public.service_requests;
create policy "Public users create requests for active units" on public.service_requests for insert with check (public.is_active_unit(unit_id) and reporter_token = public.request_reporter_token());
create policy "Reporters view their own new request" on public.service_requests for select using (reporter_token = public.request_reporter_token());
create policy "Reporters attach photos to their own request" on public.service_requests for update using (reporter_token = public.request_reporter_token()) with check (reporter_token = public.request_reporter_token());
create policy "Authorized staff view service requests" on public.service_requests for select using (public.is_king_admin() or public.is_assigned_cleaner_for_unit(unit_id) or exists (select 1 from public.units join public.sites on sites.id = units.site_id where units.id = service_requests.unit_id and sites.client_id = public.current_client_id()));
create policy "Authorized staff update service requests" on public.service_requests for update using (public.is_king_admin() or public.is_assigned_cleaner_for_unit(unit_id) or exists (select 1 from public.units join public.sites on sites.id = units.site_id where units.id = service_requests.unit_id and sites.client_id = public.current_client_id())) with check (public.is_king_admin() or public.is_assigned_cleaner_for_unit(unit_id) or exists (select 1 from public.units join public.sites on sites.id = units.site_id where units.id = service_requests.unit_id and sites.client_id = public.current_client_id()));

drop policy if exists "Allow public uploads" on storage.objects;
create policy "Public users upload report images" on storage.objects for insert to public with check (bucket_id = 'service-photos' and name like 'user_reports/%');
create policy "Authenticated users upload completion proof" on storage.objects for insert to authenticated with check (bucket_id = 'service-photos' and name like 'proof/%');
