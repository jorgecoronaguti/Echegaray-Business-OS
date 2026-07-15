-- PLAN 2 — TOMA DEL APPSHEET "Pedidos de Materiales". El OS pasa a POSEER el dato: sincroniza
-- el Google Sheet de respaldo (GESTION DE MATERIALES) a Supabase, donde queda consultable,
-- cruzable con obras/compras/costos y protegido por RLS. El Sheet sigue siendo la fuente de
-- carga (AppSheet en campo); esta tabla es el espejo gobernado por el OS.
create table if not exists public.pedidos_materiales (
  id            uuid primary key default gen_random_uuid(),
  id_pedido     text unique not null,            -- ID_PEDIDO del Sheet (clave idempotente)
  obra_texto    text,                            -- nombre de obra tal cual lo escribe el campo
  obra_id       uuid references public.obras(id),-- match resuelto contra public.obras (si hay)
  fecha         date,
  material      text,
  cantidad      numeric,
  estado        text,                            -- 'PENDIENTE' | 'ENTREGADO' | ...
  origen        text default 'appsheet_sheet',
  sincronizado_en timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists pedidos_materiales_obra on public.pedidos_materiales (obra_id);
create index if not exists pedidos_materiales_estado on public.pedidos_materiales (estado);

alter table public.pedidos_materiales enable row level security;
create policy pedidos_materiales_select on public.pedidos_materiales
  for select to authenticated using (true);
grant select on public.pedidos_materiales to authenticated;
