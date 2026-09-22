-- ANDAMIO MÍNIMO para correr las migraciones de Herramientas en un Postgres descartable.
-- NO es el esquema de producción: es lo justo para que 20260921T2100 y 20260922T1300 se puedan
-- aplicar de verdad y para que las funciones de mover se ejecuten como las ejecuta la app.
--
-- Las tablas legadas (`herramientas`, `movimientos_herramienta`, `equipos`) nacen VACÍAS: la
-- importación de 20260921T2100 no tiene nada que importar y sus controles cierran en 0 = 0. Los
-- datos de la prueba los carga el script de casos, no el andamio.
create schema if not exists auth;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
grant usage on schema public to authenticated, anon, service_role;

create table auth.users (id uuid primary key);

-- auth.uid() leyendo un GUC: así se puede "ser" un usuario u otro dentro de la misma sesión.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

create table public.perfiles (id uuid primary key, nombre text, rol text);

-- El índice de obras, con lo único que las migraciones le piden.
create table public.obra_canonica (
  id            text primary key,
  codigo        text,
  nombre        text,
  estado        text not null default 'activa',
  fusionada_en  text
);
create table public.obra_alias (
  alias          text primary key,
  obra_id        text references public.obra_canonica(id),
  clasificacion  text
);

-- Lo viejo, vacío: 20260921T2100 las renombra a *_legado y arma las vistas de compatibilidad.
create table public.herramientas (
  id uuid primary key default gen_random_uuid(),
  id_herramienta text,
  nombre text,
  ubicacion_actual text,
  imagen_url text,
  categoria text,
  fecha timestamptz,
  created_at timestamptz default now()
);
create table public.movimientos_herramienta (
  id uuid primary key default gen_random_uuid(),
  id_movimiento text,
  id_herramienta text,
  destino text,
  responsable text,
  fecha timestamptz,
  created_at timestamptz default now()
);
create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  tipo text,
  patente_o_identificador text,
  created_at timestamptz default now()
);
grant select, insert, update, delete on public.herramientas, public.movimientos_herramienta, public.equipos to authenticated, anon;

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into public.perfiles values ('11111111-1111-1111-1111-111111111111', 'Jorge (direccion)', 'direccion');
insert into public.obra_canonica (id, codigo, nombre, estado) values
  ('ob-activa', 'OB-0011', 'SF - PISOS INDUSTRIALES', 'activa'),
  ('ob-otra',   'OB-0010', 'SF - ENTREPISO Y ESCALERA', 'activa');

-- `activo.compra_proveedor_id` apunta acá; la prueba no la usa, pero la FK tiene que existir.
create table public.proveedores (id uuid primary key default gen_random_uuid(), nombre text);
