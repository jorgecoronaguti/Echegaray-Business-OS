-- ═══ BOOTSTRAP DE ENTORNO — lo que la PLATAFORMA provee y una base virgen no tiene ═══
--
-- Las migraciones de este repo nacieron contra Supabase hosted, donde estas piezas existen ANTES
-- de la primera migración porque las crea la plataforma (GoTrue, el proyecto, la consola):
--
--   · pg_cron          la consola lo activa con un click; acá se activa con el extension
--   · auth.users       la crea GoTrue; 6 migraciones le apuntan FKs (sólo referencias, nunca lectura)
--   · auth.jwt()       la instala GoTrue junto con uid()/role()/email()
--
-- Este archivo es IDEMPOTENTE y NO-OP sobre una base Supabase real: todo está guardado con
-- if-not-exists o con un DO que primero pregunta. Nunca reemplaza lo que la plataforma ya puso.

create extension if not exists pg_cron;
grant usage on schema cron to postgres;

-- Privilegios por defecto de `public`: el hosted NO reparte DML a anon/authenticated en las tablas
-- que crea postgres (baseline observada: sólo TRUNCATE, REFERENCES, TRIGGER, MAINTAIN), ni nada en
-- secuencias y funciones. La imagen de docker reparte ALL. Sin esto, cada tabla de la cadena
-- nacería con permisos MÁS ANCHOS que producción — el mismo esquema con otra seguridad no es el
-- mismo esquema. (revoke de un privilegio ausente es no-op: idempotente.)
alter default privileges for role postgres in schema public
  revoke insert, select, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- auth.users mínima: las migraciones sólo le cuelgan FKs a id. Si GoTrue ya la creó, no se toca.
do $$
begin
  if to_regclass('auth.users') is null then
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      created_at timestamptz not null default now()
    );
    comment on table auth.users is
      'Sustituto mínimo del bootstrap: en Supabase real esta tabla la crea y la gobierna GoTrue.';
    -- en hosted el rol postgres puede colgarle FKs y leerla; acá se replica ese permiso
    grant references, select on auth.users to postgres;
  end if;
end $$;

-- storage mínimo: en Supabase real lo crea storage-api. Las migraciones insertan buckets,
-- cuelgan policies sobre storage.objects y usan storage.foldername().
do $$
begin
  if to_regclass('storage.buckets') is null then
    create table storage.buckets (
      id text primary key,
      name text not null unique,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      avif_autodetection boolean not null default false,
      owner uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets (id),
      name text,
      owner uuid,
      metadata jsonb,
      created_at timestamptz not null default now()
    );
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[]
    language sql immutable
    as 'select (string_to_array(name, ''/''))[1 : array_length(string_to_array(name, ''/''), 1) - 1]';
    grant usage on schema storage to postgres, authenticated, service_role;
    grant all on storage.buckets, storage.objects to postgres, service_role;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant select on storage.buckets to authenticated;
  end if;
end $$;

-- Las funciones de auth, en la versión del HOSTED (copiadas de producción el 22/08/2026).
-- La imagen de docker trae las viejas, que sólo leen `request.jwt.claim.sub` y no el JSON de
-- `request.jwt.claims` — con ellas, auth.uid() da NULL para cualquier sesión simulada por
-- set_config y toda la RLS del OS se cierra en falso.
create or replace function auth.uid() returns uuid language sql stable
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;
create or replace function auth.role() returns text language sql stable
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$fn$;
create or replace function auth.email() returns text language sql stable
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$fn$;
create or replace function auth.jwt() returns jsonb language sql stable
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$fn$;
