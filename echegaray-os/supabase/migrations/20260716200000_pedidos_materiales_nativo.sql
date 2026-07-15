-- PLAN 2 — MÓDULO NATIVO en el OS (decisión del dueño 2026-07-15: reconstruir Pedidos/
-- Herramientas como módulos nativos controlados desde la WEB, no desde el chat). Supabase
-- pasa a ser fuente de verdad de los pedidos creados/editados en el OS. RLS de escritura
-- para usuarios autenticados (la web escribe con la sesión del usuario, respetando RLS).
--
-- Coexistencia con el AppSheet legacy durante la transición: los pedidos que se crean/editan
-- en el OS quedan marcados origen='os' y el sync desde el Sheet NO los pisa (ver
-- sync-pedidos-materiales.mjs: on conflict ... where origen='appsheet_sheet').

alter table public.pedidos_materiales add column if not exists updated_at timestamptz not null default now();
alter table public.pedidos_materiales add column if not exists creado_por uuid;

create policy pedidos_materiales_insert on public.pedidos_materiales
  for insert to authenticated with check (true);
create policy pedidos_materiales_update on public.pedidos_materiales
  for update to authenticated using (true) with check (true);
create policy pedidos_materiales_delete on public.pedidos_materiales
  for delete to authenticated using (true);

grant insert, update, delete on public.pedidos_materiales to authenticated;
