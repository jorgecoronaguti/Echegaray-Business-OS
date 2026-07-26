-- EL MODELO ÚNICO DE LIQUIDEZ VIGENTE — snapshot de finanzas.modelo_liquidez para que la Web lo LEA.
--
-- POR QUÉ (25/07). El motor de Ingeniería Financiera arma un modelo único de liquidez (disponible,
-- comprometido, líneas, colchón total) + recomendaciones (orquestador/lib/ingenieria-financiera.mjs).
-- El sync-calendario-financiero YA calcula ese modelo con la versión CORRECTA (con vencidoComercial de
-- Compras) y lo guarda dentro del payload del calendario. Este snapshot lo PROYECTA a su propia tabla
-- singleton para que la Web muestre el modelo como salida independiente del motor, sin re-leer el Sheet
-- ni recalcular un peso. Espejo exacto de finanzas_estrategia_vigente: una sola fila vigente.

create table if not exists public.finanzas_modelo_liquidez (
  id             int primary key default 1 check (id = 1), -- singleton: hay UN modelo vigente
  modelo         jsonb not null,                           -- el modelo único de liquidez (contrato finanzas.modelo_liquidez)
  recomendaciones jsonb not null default '[]'::jsonb,      -- las recomendaciones que el motor deriva del modelo
  calculado_en   timestamptz not null default now(),       -- cuándo lo calculó el motor (generado_en del calendario)
  actualizado_en timestamptz not null default now()
);

comment on table public.finanzas_modelo_liquidez is
  'Snapshot del Modelo Único de Liquidez vigente (contrato finanzas.modelo_liquidez). Se recalcula en cada ciclo del Flujo de Caja proyectando el modelo que ya calculó el calendario; la Web lo LEE, nunca recalcula. Fuente única de "cómo está la liquidez hoy".';

alter table public.finanzas_modelo_liquidez enable row level security;
drop policy if exists finanzas_modelo_liquidez_service on public.finanzas_modelo_liquidez;
create policy finanzas_modelo_liquidez_service
  on public.finanzas_modelo_liquidez for all to service_role using (true) with check (true);
drop policy if exists finanzas_modelo_liquidez_read on public.finanzas_modelo_liquidez;
create policy finanzas_modelo_liquidez_read on public.finanzas_modelo_liquidez for select to authenticated using (true);
grant select on public.finanzas_modelo_liquidez to authenticated;
