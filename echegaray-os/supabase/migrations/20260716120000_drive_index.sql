-- ============================================================================
-- ÍNDICE COMPLETO DE DRIVE — catálogo de TODOS los archivos de la carpeta
-- administracion (~1.658), para que el OS conozca cada archivo (no sólo las 23
-- fuentes curadas de fuentes_datos) y pueda buscar el correcto por nombre/ruta.
-- Aditiva y reversible. Se puebla con scripts/indexar-drive.mjs.
-- ============================================================================
create table if not exists public.drive_index (
  drive_file_id  text primary key,
  name           text not null,
  path           text,                 -- ruta legible: administracion/PRESUPUESTOS/2025/...
  mime_type      text,
  is_folder      boolean not null default false,
  tipo           text,                 -- legible: carpeta|planilla|documento|pdf|imagen|archivo
  size_bytes     bigint,
  modified_time  timestamptz,
  parent_id      text,
  depth          int,
  indexed_at     timestamptz not null default now()
);

create index if not exists drive_index_name_idx   on public.drive_index (lower(name));
create index if not exists drive_index_parent_idx on public.drive_index (parent_id);
create index if not exists drive_index_folder_idx on public.drive_index (is_folder);

alter table public.drive_index enable row level security;
grant select on public.drive_index to authenticated;
grant select, insert, update, delete on public.drive_index to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='drive_index' and policyname='drive_index_read') then
    create policy drive_index_read on public.drive_index for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='drive_index' and policyname='drive_index_srv') then
    create policy drive_index_srv on public.drive_index for all to service_role using (true) with check (true);
  end if;
end $$;
