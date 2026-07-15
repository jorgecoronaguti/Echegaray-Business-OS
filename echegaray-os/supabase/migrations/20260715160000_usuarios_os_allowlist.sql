-- ============================================================================
-- PRP-022 · Usuarios y roles — LISTA BLANCA de acceso al OS
-- ----------------------------------------------------------------------------
-- Quién puede entrar al OS y con qué rol. Login por Google (Supabase Auth); al
-- entrar se valida el email contra esta tabla. Lista blanca por EMAIL (no por
-- dominio) porque un super admin usa además una cuenta @gmail personal fuera del
-- Workspace @ecsas.com.ar. ADITIVA. No toca `perfiles` (que liga auth.uid a rol
-- una vez que el usuario ya existe en auth.users).
-- ============================================================================

create table if not exists public.usuarios_os (
  email       text primary key,
  nombre      text not null,
  rol         text not null check (rol in ('super_admin', 'usuario')),
  activo      boolean not null default true,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.usuarios_os is 'Lista blanca de acceso al OS: email -> rol. Login Google valida contra esta tabla.';

alter table public.usuarios_os enable row level security;
grant select on public.usuarios_os to authenticated;
grant select, insert, update, delete on public.usuarios_os to service_role;
-- Lectura: un usuario autenticado puede ver su propia fila (por email del JWT).
create policy usuarios_os_self on public.usuarios_os for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
-- Gestión: solo el backend de servicio (y, vía él, un super_admin) escribe.
create policy usuarios_os_srv on public.usuarios_os for all to service_role using (true) with check (true);

-- Siembra inicial (lista dada por el dueño 2026-07-15). Jorge con sus DOS cuentas.
insert into public.usuarios_os (email, nombre, rol, notas) values
  ('jorge@ecsas.com.ar',        'Jorge',                'super_admin', 'cuenta de empresa'),
  ('jorge.o.corona@gmail.com',  'Jorge',                'super_admin', 'cuenta personal (fuera del Workspace)'),
  ('rodrigo@ecsas.com.ar',      'Rodrigo',              'super_admin', 'admin del Workspace'),
  ('hys@ecsas.com.ar',          'Higiene y Seguridad',  'usuario',     null),
  ('ingenieria@ecsas.com.ar',   'Ingeniería',           'usuario',     null)
on conflict (email) do update set nombre = excluded.nombre, rol = excluded.rol, activo = true, updated_at = now();
