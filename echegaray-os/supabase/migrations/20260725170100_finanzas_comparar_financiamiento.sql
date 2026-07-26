-- COMPARADOR DE FINANCIAMIENTO VIGENTE — snapshot de finanzas.comparar_financiamiento.
--
-- POR QUÉ (25/07). El motor compara TODAS las alternativas de financiamiento (caja propia, descubierto,
-- descuento de cheque, préstamo, esperar, pronto pago) para una necesidad concreta y elige la más
-- barata factible (orquestador/lib/ingenieria-financiera.mjs · compararFinanciamiento). Es un
-- calculador que necesita un escenario (monto + días). El sync deriva un ESCENARIO REAL de la posición
-- financiera del día (el pico de descubierto proyectado en el calendario y por cuántos días), corre el
-- motor con las tasas reales de la fuente única de condiciones, y materializa el resultado para que la
-- Web lo LEA. La Web nunca elige una alternativa ni inventa una tasa: sólo muestra lo que el motor
-- decidió. El escenario queda guardado para que sea transparente de dónde salió el monto y los días.

create table if not exists public.finanzas_comparar_financiamiento (
  id             int primary key default 1 check (id = 1), -- singleton: hay UNA comparación vigente
  comparacion    jsonb not null,                           -- resultado del motor + escenario + faltan_datos
  calculado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.finanzas_comparar_financiamiento is
  'Snapshot del comparador de financiamiento vigente (contrato finanzas.comparar_financiamiento) para un escenario real derivado de la posición del día. La Web lo LEE, nunca recalcula ni inventa una tasa. Las alternativas sin tasa cargada se declaran en faltan_datos.';

alter table public.finanzas_comparar_financiamiento enable row level security;
drop policy if exists finanzas_comparar_financiamiento_service on public.finanzas_comparar_financiamiento;
create policy finanzas_comparar_financiamiento_service
  on public.finanzas_comparar_financiamiento for all to service_role using (true) with check (true);
drop policy if exists finanzas_comparar_financiamiento_read on public.finanzas_comparar_financiamiento;
create policy finanzas_comparar_financiamiento_read on public.finanzas_comparar_financiamiento for select to authenticated using (true);
grant select on public.finanzas_comparar_financiamiento to authenticated;
