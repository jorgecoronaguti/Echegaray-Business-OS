-- SCORECARD DEL ÁREA + KPIs DEL PROPIO OS — tabla materializada, append-only por corrida (F6).
--
-- POR QUÉ (27/07 · F6). El OS ya tiene la salud de Admin y Finanzas repartida en fuentes únicas
-- (public.finanzas_modelo_liquidez = posición/colchón/obligaciones, public.fuentes_datos = frescura,
-- public.finanzas_caja_negra = predicciones congeladas para medir el forecast). Faltaba un tablero
-- que junte "cómo está el área" con "cuánto aprende el propio OS" y que muestre TENDENCIA. Este es su
-- registro materializado: el sync sync-scorecard-finanzas.mjs lee esas fuentes, arma un snapshot y lo
-- congela acá; la Web SÓLO LEE esta tabla (0 recálculo en React).
--
-- FUENTE ÚNICA INTACTA. No duplica la propiedad de ningún número: cada fila apunta con `fuente_unica`
-- a dónde vive de verdad el dato (finanzas_modelo_liquidez, fuentes_datos, finanzas_caja_negra). El
-- scorecard es una LECTURA fechada de esas fuentes para poder graficar la evolución, no una segunda
-- versión de la verdad. Lo que la fuente no trae no se inventa: se guarda valor NULL con estado
-- 'sin_datos' y, en `detalle.de_donde_saldria`, de qué fuente saldría cuando exista.
--
-- APPEND-ONLY / REPLICABLE. Cada corrida del sync mina un corrida_id nuevo: dos snapshots del mismo
-- día conviven como dos puntos de la historia (así se construye la tendencia). La columna `area` deja
-- esta MISMA tabla lista para las otras 6 áreas de la empresa — es la plantilla, no una tabla ad-hoc.

create table if not exists public.finanzas_scorecard (
  id            bigint generated always as identity primary key,
  corrida_id    uuid        not null,                       -- agrupa las métricas de UN snapshot
  area          text        not null default 'admin_finanzas',  -- REPLICABLE: las otras 6 áreas reusan la tabla
  seccion       text        not null                        -- salud del área vs. métricas del propio OS
                check (seccion in ('salud_area', 'metricas_os')),
  metrica       text        not null,                       -- clave estable (caja_hoy, frescura_pct, ...)
  etiqueta      text        not null,                       -- rótulo humano para la Web
  valor         numeric,                                    -- el valor leído; NULL si la fuente no lo trajo
  unidad        text        not null default 'pesos'
                check (unidad in ('pesos', 'porcentaje', 'dias', 'cantidad', 'texto')),
  estado        text        not null default 'ok'
                check (estado in ('ok', 'sin_datos')),      -- 'sin_datos' = la fuente aún no da el número
  fuente_unica  text        not null,                       -- dónde vive de verdad el dato (no se duplica la propiedad)
  orden         integer     not null default 0,             -- orden de despliegue dentro de la sección
  detalle       jsonb,                                      -- contexto: valor_anterior, variacion, de_donde_saldria, valor_texto
  capturado_en  timestamptz not null default now(),
  -- IDEMPOTENCIA POR CORRIDA: registrar dos veces el mismo snapshot no duplica. Distintas corridas
  -- (distinto corrida_id) SIEMPRE conviven: eso es la tendencia.
  unique (corrida_id, area, seccion, metrica)
);

comment on table public.finanzas_scorecard is
  'Scorecard materializado (F6): salud de Admin/Finanzas + KPIs del propio OS (precisión de forecast, frescura de fuentes), congelado por corrida para tener tendencia. La Web SÓLO lee esta tabla. No recalcula ni inventa: lee las fuentes únicas (finanzas_modelo_liquidez, fuentes_datos, finanzas_caja_negra), apunta a ellas con fuente_unica y marca lo que falta como sin_datos. La columna area la hace plantilla replicable para las otras 6 áreas.';

-- La Web pide el snapshot vigente (última corrida) y la serie por métrica para la mini-tendencia.
create index if not exists finanzas_scorecard_area_captura_idx
  on public.finanzas_scorecard (area, capturado_en desc);
create index if not exists finanzas_scorecard_serie_idx
  on public.finanzas_scorecard (area, metrica, capturado_en);

-- Vista del snapshot VIGENTE por área: las filas de la ÚLTIMA corrida registrada. Se identifica por el
-- id monotónico (no por capturado_en, que puede empatar entre corridas cuando comparten la marca de
-- datos de la fuente) → la corrida del último id insertado gana. La tabla completa queda para la
-- tendencia; esta vista es sólo "cómo está hoy".
create or replace view public.finanzas_scorecard_vigente as
  select s.*
  from public.finanzas_scorecard s
  where s.corrida_id = (
    select x.corrida_id
    from public.finanzas_scorecard x
    where x.area = s.area
    order by x.id desc
    limit 1
  );

comment on view public.finanzas_scorecard_vigente is
  'Snapshot vigente del scorecard por área: filas de la última corrida registrada. La Web la lee para el estado actual; finanzas_scorecard completa alimenta la tendencia.';

-- RLS coherente con las otras finanzas_*: SELECT sólo a authenticated; el service_role (worker) escribe.
-- Sin políticas de UPDATE/DELETE para authenticated: refuerza el append-only desde la base.
alter table public.finanzas_scorecard enable row level security;
drop policy if exists finanzas_scorecard_service on public.finanzas_scorecard;
create policy finanzas_scorecard_service
  on public.finanzas_scorecard for all to service_role using (true) with check (true);
drop policy if exists finanzas_scorecard_read on public.finanzas_scorecard;
create policy finanzas_scorecard_read on public.finanzas_scorecard for select to authenticated using (true);
grant select on public.finanzas_scorecard to authenticated;
grant select on public.finanzas_scorecard_vigente to authenticated;
