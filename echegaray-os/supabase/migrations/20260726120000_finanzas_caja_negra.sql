-- LA CAJA NEGRA — registro APPEND-ONLY de lo que el motor financiero predijo, con fecha.
--
-- POR QUÉ (26/07 · F0, cimiento del aprendizaje). Los cuatro syncs financieros (estrategia, plan de
-- tesorería, modelo de liquidez, calendario) materializan en cada corrida una foto VIGENTE en tablas
-- singleton (finanzas_estrategia_vigente, finanzas_plan_vigente, finanzas_modelo_liquidez,
-- finanzas_calendario) que se PISAN. Nunca queda registro de "qué predijo el OS el día X". Sin ese
-- histórico congelado no hay forma de medir después si el forecast fue bueno (eso es lo que necesita
-- F2). Esta tabla es ese registro: cada predicción del motor, con timestamp, congelada y jamás pisada.
--
-- NO recalcula ni duplica ningún número: consume la foto que el motor YA produjo y guarda las cifras
-- tal cual (fuente única intacta). Lo que la foto no trae no se inventa: se guarda valor NULL con
-- estado 'sin_dato', para que el hueco quede en la historia en vez de taparse con un número falso.
--
-- APPEND-ONLY DE VERDAD: no hay política de UPDATE ni DELETE para authenticated; el on conflict del
-- registro es DO NOTHING (jamás pisa una predicción anterior). Cada corrida de un sync mina su propio
-- corrida_id, así dos fotos del mismo motor conviven como dos momentos distintos de la historia.

create table if not exists public.finanzas_caja_negra (
  id             bigint generated always as identity primary key,
  corrida_id     uuid        not null,                    -- agrupa todas las predicciones de UNA foto
  fuente         text        not null                     -- qué motor la produjo
                 check (fuente in ('estrategia', 'plan', 'modelo', 'calendario')),
  clave          text        not null,                    -- clave estable de la predicción DENTRO de la corrida
  metrica        text        not null,                    -- qué se predijo (caja_hoy, saldo_final_proyectado, ...)
  horizonte      text,                                    -- ventana de la predicción (dias_7, mes, ...) o NULL
  fecha_objetivo date,                                    -- fecha CONCRETA a la que apunta la predicción, o NULL
  valor          numeric,                                 -- el valor predicho; NULL si la foto no lo trajo (nunca inventado)
  unidad         text        not null default 'pesos',    -- 'pesos' | 'dias' | 'texto'
  estado         text        not null default 'ok'        -- 'ok' | 'sin_dato' (la foto/leaf vino incompleta) | 'sin_foto'
                 check (estado in ('ok', 'sin_dato', 'sin_foto')),
  detalle        jsonb,                                   -- contexto mínimo (etiqueta, motivo del sin_dato, valor textual)
  calculado_en   timestamptz not null,                    -- cuándo el motor calculó la foto (marca real, no la del proyecto)
  registrado_en  timestamptz not null default now(),      -- cuándo se congeló en la caja negra
  -- IDEMPOTENCIA POR CORRIDA: registrar dos veces la misma foto no duplica; el DO NOTHING preserva lo
  -- ya escrito. Distintas corridas (distinto corrida_id) SIEMPRE conviven: eso es el histórico.
  unique (corrida_id, clave)
);

comment on table public.finanzas_caja_negra is
  'Caja negra append-only: cada predicción del motor de Ingeniería Financiera (estrategia/plan/modelo/calendario), congelada con timestamp. La foto vigente se pisa; esto NO. Es el cimiento del aprendizaje: permite a F2 medir después el forecast contra la realidad. No recalcula ni inventa: consume la foto y marca lo que falta como sin_dato.';

-- F2 consulta por fuente/métrica a lo largo del tiempo, y por la fecha a la que apuntó una predicción.
create index if not exists finanzas_caja_negra_fuente_metrica_idx
  on public.finanzas_caja_negra (fuente, metrica, registrado_en desc);
create index if not exists finanzas_caja_negra_fecha_objetivo_idx
  on public.finanzas_caja_negra (fecha_objetivo) where fecha_objetivo is not null;
create index if not exists finanzas_caja_negra_corrida_idx
  on public.finanzas_caja_negra (corrida_id);

-- RLS coherente con las otras finanzas_*: SELECT sólo a authenticated; el service_role (worker) escribe.
-- Sin políticas de UPDATE/DELETE: refuerza el append-only desde la base, no sólo desde el código.
alter table public.finanzas_caja_negra enable row level security;
drop policy if exists finanzas_caja_negra_service on public.finanzas_caja_negra;
create policy finanzas_caja_negra_service
  on public.finanzas_caja_negra for all to service_role using (true) with check (true);
drop policy if exists finanzas_caja_negra_read on public.finanzas_caja_negra;
create policy finanzas_caja_negra_read on public.finanzas_caja_negra for select to authenticated using (true);
grant select on public.finanzas_caja_negra to authenticated;
