-- ANDAMIO MÍNIMO que reproduce lo que la migración de `persona_nota` necesita del esquema real.
-- NO es el esquema de producción: es lo justo para que las policies se ejecuten de verdad.
--
-- `es_administracion()` se copia de su definición VIGENTE (20260819T4900), la que INCLUYE a
-- jefe_obra. El andamio de `cliente_nota` tiene la anterior, de cuando el jefe no administraba: si
-- se reusara ése, la prueba diría que el jefe de obra no puede anotar y el defecto sería del
-- andamio, no del sistema.
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
create table public.personas (id uuid primary key default gen_random_uuid(), nombre_completo text);
grant select on public.personas to authenticated;

create function public.current_rol() returns text language sql stable security definer set search_path to 'public' as $$
  select rol from public.perfiles where id = auth.uid()
$$;
create function public.es_administracion() returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.current_rol() in ('direccion','administracion','jefe_obra'), false)
$$;
grant execute on function public.current_rol(), public.es_administracion() to authenticated, service_role;

insert into public.perfiles values
  ('11111111-1111-1111-1111-111111111111','Jorge (direccion)','direccion'),
  ('22222222-2222-2222-2222-222222222222','Rodrigo (jefe_obra)','jefe_obra'),
  ('33333333-3333-3333-3333-333333333333','Un obrero (campo)','campo');
insert into public.personas (id, nombre_completo)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Maldonado, Juan');
