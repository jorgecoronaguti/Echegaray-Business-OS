-- CONDICIONES DE FINANCIAMIENTO VIGENTES — snapshot de finanzas.condiciones_financieras.
--
-- POR QUÉ (25/07). La fuente única de tasas, costos y límites vigentes (descubierto, préstamos,
-- descuento de cheque, tarjeta) vive en public.condiciones_financieras y el motor la expone con su
-- fuente, vigencia y nivel de confianza, más lo que EXISTE como producto pero todavía no tiene tasa
-- cargada (orquestador/lib/condiciones-financieras.mjs). El sync la proyecta a esta tabla singleton
-- para que la Web la muestre como salida del motor sin abrir la tabla base ni recalcular. Toda tasa
-- lleva su fuente; las que faltan se declaran, nunca se inventan.

create table if not exists public.finanzas_condiciones_vigentes (
  id             int primary key default 1 check (id = 1), -- singleton: una foto de las condiciones vigentes
  condiciones    jsonb not null,                           -- {condiciones:[...], faltan_datos:[...]}
  calculado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.finanzas_condiciones_vigentes is
  'Snapshot de las condiciones de financiamiento vigentes (contrato finanzas.condiciones_financieras). La Web lo LEE. Cada tasa lleva fuente y nivel de confianza; lo que falta se declara en faltan_datos, nunca se inventa.';

alter table public.finanzas_condiciones_vigentes enable row level security;
drop policy if exists finanzas_condiciones_vigentes_service on public.finanzas_condiciones_vigentes;
create policy finanzas_condiciones_vigentes_service
  on public.finanzas_condiciones_vigentes for all to service_role using (true) with check (true);
drop policy if exists finanzas_condiciones_vigentes_read on public.finanzas_condiciones_vigentes;
create policy finanzas_condiciones_vigentes_read on public.finanzas_condiciones_vigentes for select to authenticated using (true);
grant select on public.finanzas_condiciones_vigentes to authenticated;
