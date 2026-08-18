-- ANDAMIO MÍNIMO que reproduce lo que la migración necesita del esquema real.
-- NO es el esquema de producción: es lo justo para que las policies se puedan ejecutar de verdad.
create schema if not exists auth;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public to authenticated, service_role;

-- auth.uid() leyendo un GUC: así se puede "ser" un usuario u otro dentro de la misma sesión.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

create table public.perfiles (id uuid primary key, nombre text, rol text);
create table public.clientes (id uuid primary key default gen_random_uuid(), nombre text);
grant select on public.clientes to authenticated;

create function public.current_rol() returns text language sql stable security definer set search_path to 'public' as $$
  select rol from public.perfiles where id = auth.uid()
$$;
create function public.es_administracion() returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.current_rol() in ('direccion','administracion'), false)
$$;
grant execute on function public.current_rol(), public.es_administracion() to authenticated, service_role;

insert into public.perfiles values
  ('11111111-1111-1111-1111-111111111111','Jorge (direccion)','direccion'),
  ('22222222-2222-2222-2222-222222222222','Rodrigo (jefe_obra)','jefe_obra');
insert into public.clientes (id, nombre) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','La Estrella');
