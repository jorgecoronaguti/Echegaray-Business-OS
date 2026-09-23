-- «ENTRAR COMO» DEJA HUELLA (dueño, 23/09/2026).
--
-- Dirección puede abrir una sesión REAL de otro usuario para ver exactamente lo que ve ese nivel con
-- los permisos de la base, y operar si hace falta (`src/lib/auth/entrar-como.ts`). Una sesión
-- prestada sin registro es una suplantación: acá queda quién entró, como quién, cuándo entró y
-- cuándo volvió. La fila la escribe el servidor con la clave de servicio en el mismo acto que abre la
-- sesión; nadie la escribe con sesión de usuario.
--
-- QUIÉN LA LEE: Dirección (las suyas y las de cualquier otra Dirección: el registro existe para que
-- se pueda auditar, no para que cada uno vea sólo lo propio) y la persona a la que se le entró
-- (`objetivo_id = auth.uid()`): tiene derecho a saber que alguien estuvo en su cuenta.

create table if not exists public.auditoria_entrar_como (
  id            uuid primary key default gen_random_uuid(),
  direccion_id  uuid not null references auth.users (id) on delete cascade,
  objetivo_id   uuid not null references auth.users (id) on delete cascade,
  objetivo_rol  text,
  entro_en      timestamptz not null default now(),
  volvio_en     timestamptz,
  motivo        text,
  user_agent    text,
  ip            text,
  constraint auditoria_entrar_como_no_a_si_mismo check (direccion_id <> objetivo_id)
);

comment on table public.auditoria_entrar_como is
  'Cada vez que Dirección entra a la app como otro usuario (sesión real, no la lente «ver como»): quién, como quién, cuándo entró y cuándo volvió. La escribe el servidor con la clave de servicio.';
comment on column public.auditoria_entrar_como.volvio_en is
  'Cuándo tocó «Volver a mi cuenta». Nulo = la sesión prestada sigue abierta o se cerró sin volver (vencimiento o cierre de sesión).';

create index if not exists auditoria_entrar_como_direccion on public.auditoria_entrar_como (direccion_id, entro_en desc);
create index if not exists auditoria_entrar_como_objetivo on public.auditoria_entrar_como (objetivo_id, entro_en desc);

alter table public.auditoria_entrar_como enable row level security;

drop policy if exists auditoria_entrar_como_lee on public.auditoria_entrar_como;
create policy auditoria_entrar_como_lee on public.auditoria_entrar_como
  for select to authenticated
  using (public.current_rol() = 'direccion' or objetivo_id = auth.uid());

-- Sólo lectura con sesión: insertar y cerrar la fila es del servidor (service_role, que salta la RLS).
grant select on public.auditoria_entrar_como to authenticated;
grant select, insert, update, delete on public.auditoria_entrar_como to service_role;
