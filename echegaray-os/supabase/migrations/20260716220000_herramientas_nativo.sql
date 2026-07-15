-- PLAN 2 — MÓDULO NATIVO Herramientas (con IMÁGENES, algo que AppSheet no resolvía fácil).
-- Inventario de herramientas con ubicación actual + foto. Espeja el AppSheet (tabla
-- HERRAMIENTAS) y agrega imagen_url (foto en Supabase Storage). Control desde la web.

create table if not exists public.herramientas (
  id              uuid primary key default gen_random_uuid(),
  id_herramienta  text unique not null,          -- ID del Sheet (clave idempotente)
  nombre          text not null,
  ubicacion_actual text,                          -- ALMACEN / TALLER / <obra>
  imagen_url      text,                           -- foto en Storage (bucket 'herramientas')
  fecha           timestamptz,
  origen          text default 'appsheet_sheet',  -- 'os' cuando se crea/edita en el OS
  sincronizado_en timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists herramientas_ubicacion on public.herramientas (ubicacion_actual);

alter table public.herramientas enable row level security;
create policy herramientas_select on public.herramientas for select to authenticated using (true);
create policy herramientas_insert on public.herramientas for insert to authenticated with check (true);
create policy herramientas_update on public.herramientas for update to authenticated using (true) with check (true);
create policy herramientas_delete on public.herramientas for delete to authenticated using (true);
grant select, insert, update, delete on public.herramientas to authenticated;

-- Bucket de imágenes de herramientas (lectura pública para mostrarlas; escritura autenticada).
insert into storage.buckets (id, name, public)
values ('herramientas', 'herramientas', true)
on conflict (id) do nothing;

create policy "herramientas_img_read" on storage.objects
  for select using (bucket_id = 'herramientas');
create policy "herramientas_img_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'herramientas');
create policy "herramientas_img_update" on storage.objects
  for update to authenticated using (bucket_id = 'herramientas');
create policy "herramientas_img_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'herramientas');
