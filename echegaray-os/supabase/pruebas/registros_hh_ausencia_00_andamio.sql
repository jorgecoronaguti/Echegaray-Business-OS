-- ANDAMIO MÍNIMO para probar la RLS de `registros_hh` con una ausencia SIN obra.
--
-- NO es el esquema de producción: es lo justo para que las policies de `20260908T2000` se ejecuten
-- de verdad. Cada pieza se copia de su definición VIGENTE al 08/09/2026, con su migración al lado:
-- si se reusara una versión vieja, la prueba acusaría al sistema de un defecto que sería del andamio.
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

create table public.perfiles (id uuid primary key, nombre text, rol text, persona_id uuid);
create table public.personas (id uuid primary key default gen_random_uuid(), nombre_completo text);
create table public.obra_canonica (id text primary key, nombre text, estado text, jornada_horas numeric);
create table public.usuario_obra (usuario_id uuid, obra_canonica_id text);
create table public.obra_asignacion (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null references public.obra_canonica(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  rol text not null default 'integrante',
  desde date, hasta date
);
grant select on public.personas, public.obra_canonica, public.obra_asignacion to authenticated;

-- `registros_hh` con lo que las policies y los checks miran. Los constraints se copian de
-- `20260819T2200` (tiene_quien, persona_con_fecha), `20260819T3000` (tipo_hora) y el original
-- (horas > 0): sin ellos, el caso «una fila normal sin obra no entra» probaría otra cosa.
create table public.registros_hh (
  id uuid primary key default gen_random_uuid(),
  obra_canonica_id text references public.obra_canonica(id),
  persona_id uuid references public.personas(id) on delete cascade,
  trabajador_o_cuadrilla text,
  actividad_id uuid,
  fecha date,
  fecha_inicio_semana date not null,
  horas numeric(6,2) not null check (horas > 0),
  tipo_hora text not null default 'normal'
    check (tipo_hora in ('normal', 'extra_50', 'extra_100', 'ausencia', 'licencia')),
  improductiva boolean not null default false,
  notas text,
  fuente_legacy text not null default 'prueba'
);
alter table public.registros_hh enable row level security;
grant select, insert, update, delete on public.registros_hh to authenticated;

create function public.current_rol() returns text language sql stable security definer set search_path to 'public' as $$
  select rol from public.perfiles where id = auth.uid()
$$;
-- `es_administracion()` VIGENTE (20260819T4900): INCLUYE a jefe_obra.
create function public.es_administracion() returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.current_rol() in ('direccion','administracion','jefe_obra'), false)
$$;
create function public.mi_persona_id() returns uuid language sql stable security definer set search_path to 'public' as $$
  select persona_id from public.perfiles where id = auth.uid()
$$;
create function public.asignacion_vigente(p_desde date, p_hasta date) returns boolean language sql immutable as $$
  select (p_desde is null or p_desde <= current_date) and (p_hasta is null or p_hasta >= current_date)
$$;
-- `ve_obra()` VIGENTE (20260820T6000): el jefe de obra ve TODAS las obras. Es lo que hace que la
-- cota de una fila sin obra NO pueda apoyarse en ve_obra sola.
create function public.ve_obra(p_obra text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.es_administracion()
      or public.current_rol() = 'jefe_obra'
      or exists (select 1 from public.usuario_obra uo where uo.usuario_id = auth.uid() and uo.obra_canonica_id = p_obra)
      or exists (
        select 1 from public.obra_asignacion a
        where a.persona_id = public.mi_persona_id() and a.obra_id = p_obra
          and public.asignacion_vigente(a.desde, a.hasta)
      )
$$;
grant execute on function public.current_rol(), public.es_administracion(), public.mi_persona_id(),
  public.asignacion_vigente(date, date), public.ve_obra(text) to authenticated, service_role;

insert into public.perfiles (id, nombre, rol, persona_id) values
  ('11111111-1111-1111-1111-111111111111','Jorge (direccion)','direccion', null),
  ('22222222-2222-2222-2222-222222222222','Rodrigo (jefe_obra)','jefe_obra', null),
  ('33333333-3333-3333-3333-333333333333','Un obrero (campo)','campo','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.personas (id, nombre_completo) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Gonzalez Tobares, Luis'),   -- asignado a una obra viva
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Sin Asignacion, Juan');     -- sin asignación vigente
insert into public.obra_canonica (id, nombre, estado, jornada_horas) values
  ('obra-viva','Quattropani','activa', 9),
  ('la-estrella','La Estrella Galpón 9','cerrada', 8);
-- La asignación de Gonzalez Tobares está VIGENTE hoy. La de Sin Asignacion venció el año pasado:
-- es la que prueba que la cota del jefe existe.
insert into public.obra_asignacion (obra_id, persona_id, desde, hasta) values
  ('obra-viva','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 30, null),
  ('la-estrella','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date - 400, current_date - 300);

-- La fila legacy que obliga al CHECK a nacer `not valid`: sin obra, `normal` y sin fecha. En la
-- base real hay 19 iguales (medido el 08/09/2026).
insert into public.registros_hh (obra_canonica_id, trabajador_o_cuadrilla, fecha, fecha_inicio_semana, horas, tipo_hora)
  values (null, 'JORNALES 2024 · cuadrilla', null, current_date - 500, 44, 'normal');
