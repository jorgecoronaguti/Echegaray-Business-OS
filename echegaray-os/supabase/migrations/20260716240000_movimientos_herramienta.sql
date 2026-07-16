-- PLAN 2 — MOVIMIENTOS de herramientas (log de traslados). Espeja la tabla MOVIMIENTOS del
-- AppSheet y habilita registrar un movimiento desde la web: mueve la herramienta a una
-- ubicación/obra, actualiza herramientas.ubicacion_actual y deja el log con responsable+fecha.
create table if not exists public.movimientos_herramienta (
  id              uuid primary key default gen_random_uuid(),
  id_movimiento   text unique not null,           -- ID del Sheet o 'OS-<ts>'
  id_herramienta  text not null,                  -- ref a herramientas.id_herramienta
  destino         text,                           -- ubicación/obra destino
  responsable     text,
  fecha           timestamptz,
  origen          text default 'appsheet_sheet',
  sincronizado_en timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists mov_herr_idherr on public.movimientos_herramienta (id_herramienta, fecha desc);

alter table public.movimientos_herramienta enable row level security;
create policy mov_herr_select on public.movimientos_herramienta for select to authenticated using (true);
create policy mov_herr_insert on public.movimientos_herramienta for insert to authenticated with check (true);
create policy mov_herr_delete on public.movimientos_herramienta for delete to authenticated using (true);
grant select, insert, delete on public.movimientos_herramienta to authenticated;
