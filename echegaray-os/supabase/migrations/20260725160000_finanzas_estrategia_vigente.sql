-- LA ESTRATEGIA FINANCIERA VIGENTE — la salida del Financial Engineering que gobierna el Calendario.
--
-- POR QUÉ (25/07). El dueño: "el Financial Engineering no debe comportarse como un planificador
-- operativo de pagos. Debe comportarse como un ESTRATEGA FINANCIERO de nivel CFO". El motor
-- (orquestador/lib/estrategia-financiera.mjs) ya produce ese documento estratégico completo (qué
-- problema financiero existe, qué estrategia conviene, por qué es superior a las alternativas, cuánto
-- mejora la liquidez futura, qué riesgos quedan). Esta tabla es su snapshot vigente: el sync la
-- recalcula en cada ciclo del Flujo de Caja y la Web (Calendario Financiero) la LEE para hacer de la
-- ESTRATEGIA la protagonista del día. No hay una sola regla financiera en la Web: acá sólo se guarda
-- lo que el motor ya decidió, exactamente como public.finanzas_plan_vigente guarda el plan operativo.

create table if not exists public.finanzas_estrategia_vigente (
  id            int primary key default 1 check (id = 1), -- singleton: hay UNA estrategia vigente
  estrategia    jsonb not null,                           -- el documento estratégico completo (contrato finanzas.estrategia_financiera)
  calculado_en  timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.finanzas_estrategia_vigente is
  'Snapshot de la Estrategia Financiera vigente (contrato finanzas.estrategia_financiera). Se recalcula en cada ciclo del Flujo de Caja; la Web la LEE para hacer de la estrategia el protagonista del Calendario Financiero. La Web nunca recalcula: fuente única de "cuál es la estrategia que el OS está ejecutando".';

alter table public.finanzas_estrategia_vigente enable row level security;
-- El servidor (worker, service_role) recalcula y escribe. Espejo exacto de finanzas_plan_vigente.
drop policy if exists finanzas_estrategia_vigente_service on public.finanzas_estrategia_vigente;
create policy finanzas_estrategia_vigente_service
  on public.finanzas_estrategia_vigente for all to service_role using (true) with check (true);
-- La Web (Dirección autenticada) LEE la estrategia vigente para mostrarla. Escribir es sólo del
-- servidor con service_role, nunca del cliente.
drop policy if exists finanzas_estrategia_vigente_read on public.finanzas_estrategia_vigente;
create policy finanzas_estrategia_vigente_read on public.finanzas_estrategia_vigente for select to authenticated using (true);
grant select on public.finanzas_estrategia_vigente to authenticated;
