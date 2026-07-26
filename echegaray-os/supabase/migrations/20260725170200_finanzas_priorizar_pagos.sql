-- PRIORIZACIÓN DE PAGOS VIGENTE — snapshot de finanzas.priorizar_pagos.
--
-- POR QUÉ (25/07). El motor ordena los pagos por prioridad real (vencimiento + costo de no pagar +
-- criticidad del proveedor/obra + liquidez), NO por fecha, y reparte la caja: lo que no entra pasa a
-- "esperar" (orquestador/lib/ingenieria-financiera.mjs · priorizarPagos). El sync toma la lista REAL de
-- egresos que el calendario ya materializó (próximos 30 días), la caja real del modelo, corre el motor
-- y guarda el orden con la decisión (pagar/parcial/esperar) y el motivo económico de cada pago. La Web
-- lo LEE: nunca decide a quién pagar ni recalcula un score.

create table if not exists public.finanzas_priorizar_pagos (
  id             int primary key default 1 check (id = 1), -- singleton: hay UNA priorización vigente
  priorizacion   jsonb not null,                           -- {pagos:[...], caja_disponible, ventana_dias, ...}
  calculado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.finanzas_priorizar_pagos is
  'Snapshot de la priorización de pagos vigente (contrato finanzas.priorizar_pagos) sobre los egresos reales de los próximos 30 días y la caja real. La Web lo LEE, nunca decide a quién pagar ni recalcula.';

alter table public.finanzas_priorizar_pagos enable row level security;
drop policy if exists finanzas_priorizar_pagos_service on public.finanzas_priorizar_pagos;
create policy finanzas_priorizar_pagos_service
  on public.finanzas_priorizar_pagos for all to service_role using (true) with check (true);
drop policy if exists finanzas_priorizar_pagos_read on public.finanzas_priorizar_pagos;
create policy finanzas_priorizar_pagos_read on public.finanzas_priorizar_pagos for select to authenticated using (true);
grant select on public.finanzas_priorizar_pagos to authenticated;
