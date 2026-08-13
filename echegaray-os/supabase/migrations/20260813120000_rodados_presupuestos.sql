-- PRESUPUESTOS DE RODADOS — snapshot de los presupuestos que el dueño juntó para decidir la compra.
--
-- POR QUÉ (13/08). El dueño pidió el 07/08 que quedaran guardados "los presupuestos y préstamos para
-- adquirir rodados" y lo que se había guardado era el análisis en prosa, no los datos. La
-- transcripción declarada de los adjuntos vive en orquestador/lib/rodados-datos.mjs; esta tabla es la
-- proyección que leen la Web y el chat, para que "¿qué presupuestos tengo para rodados?" se conteste
-- sin volver a mirar las fotos.
--
-- POR QUÉ UNA TABLA NUEVA Y NO UNA QUE YA ESTÁ. Se miraron las dos candidatas:
--   · public.condiciones_financieras — es la fuente única de TASAS, y ahí va (y sólo ahí) la
--     condición del crédito UVA. No modela un vehículo, un precio ni una vigencia comercial.
--   · public.equipos (20260708135001) — es la FLOTA QUE LA EMPRESA TIENE, con patente. Un rodado que
--     todavía no se compró no es un equipo: meterlo ahí inflaría la flota con unidades inexistentes.
-- No hay dónde guardar una COTIZACIÓN de rodado. Por eso esta tabla, con la misma forma de singleton
-- jsonb que finanzas_condiciones_vigentes (20260725170300): son pocos documentos, se leen enteros y
-- el shape lo define el módulo, no el esquema.
--
-- LAS TASAS NO SE DUPLICAN ACÁ. El jsonb referencia la condición por su clave; el número vive en
-- condiciones_financieras. Dos tablas con la misma tasa es dos verdades esperando divergir.

create table if not exists public.rodados_presupuestos (
  id             int primary key default 1 check (id = 1), -- singleton: una foto de los presupuestos juntados
  presupuestos   jsonb not null,                           -- {presupuestos:[...], condicion_financiera:{...}, falta:[...]}
  calculado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.rodados_presupuestos is
  'Snapshot de los presupuestos de rodados y de la condición del crédito asociada (fuente declarada: orquestador/lib/rodados-datos.mjs, transcripción de los adjuntos del dueño del 07/08/2026). La Web y el chat lo LEEN. Cada dato lleva el adjunto del que salió; lo que no se pudo leer está en falta[], nunca inventado. La TASA no vive acá: vive en public.condiciones_financieras y se referencia por clave.';

alter table public.rodados_presupuestos enable row level security;
drop policy if exists rodados_presupuestos_service on public.rodados_presupuestos;
create policy rodados_presupuestos_service
  on public.rodados_presupuestos for all to service_role using (true) with check (true);
drop policy if exists rodados_presupuestos_read on public.rodados_presupuestos;
create policy rodados_presupuestos_read on public.rodados_presupuestos for select to authenticated using (true);
grant select on public.rodados_presupuestos to authenticated;
