-- EL PLAN DE TESORERÍA VIGENTE — se recalcula solo, pero NO se ejecuta solo.
--
-- POR QUÉ (24/07). El dueño: "mantené automático únicamente el recálculo de finanzas.plan_tesoreria.
-- Cuando el plan cambie, mostrar el nuevo plan y marcarlo como pendiente de ejecución, pero no crear
-- tareas operativas hasta recibir autorización". Esta tabla es esa frontera: guarda el snapshot del
-- plan vigente y su estado. El recálculo (barato, determinista, sin costo) lo actualiza en cada ciclo;
-- la EJECUCIÓN (crear tareas para los especialistas, que el worker corre y cuesta) sólo ocurre cuando
-- alguien autorizado la pide. Un cambio de plan pasa el estado a 'pendiente_ejecucion' y ahí espera.

create table if not exists public.finanzas_plan_vigente (
  id            int primary key default 1 check (id = 1), -- singleton: hay UN plan vigente
  horizonte     text not null,
  plan_hash     text not null,                            -- huella del conjunto de acciones ejecutables
  plan          jsonb not null,                           -- el snapshot completo (para mostrarlo)
  cambios       jsonb,                                    -- qué cambió vs el plan anterior (agregadas/eliminadas/reprogramadas)
  estado        text not null default 'pendiente_ejecucion'
                  check (estado in ('pendiente_ejecucion','autorizado','ejecutado')),
  calculado_en  timestamptz not null default now(),
  autorizado_por text,                                    -- quién autorizó la ejecución (dueño/director/cfo/interfaz)
  autorizado_en  timestamptz,
  ejecutado_en   timestamptz,
  correlation_id uuid,                                    -- las tareas del Work Fabric de esta ejecución (para el seguimiento)
  actualizado_en timestamptz not null default now()
);

comment on table public.finanzas_plan_vigente is
  'Snapshot del Plan de Tesorería vigente y su estado. El recálculo es automático; la ejecución (crear tareas) requiere autorización explícita. Fuente única de "hay un plan pendiente de ejecutar".';

alter table public.finanzas_plan_vigente enable row level security;
drop policy if exists finanzas_plan_vigente_service on public.finanzas_plan_vigente;
create policy finanzas_plan_vigente_service
  on public.finanzas_plan_vigente for all to service_role using (true) with check (true);
-- La Web (Dirección autenticada) LEE el plan vigente para revisarlo/aprobarlo. Escribir (autorizar,
-- ejecutar) es del servidor con service_role, nunca del cliente.
drop policy if exists finanzas_plan_vigente_read on public.finanzas_plan_vigente;
create policy finanzas_plan_vigente_read on public.finanzas_plan_vigente for select to authenticated using (true);
grant select on public.finanzas_plan_vigente to authenticated;
